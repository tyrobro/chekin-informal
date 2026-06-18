<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use App\Features\PostEventSync\Repositories\PostgresCheckpointRepository;
use Tests\TestCase;

/**
 * Unit tests for PostgresCheckpointRepository (task 6.3)
 *
 * Requirements: 5.4, 5.5
 *
 * @group c3-post-event-sync
 */
class PostgresCheckpointRepositoryTest extends TestCase
{
    use RefreshDatabase;

    private PostgresCheckpointRepository $repo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repo = new PostgresCheckpointRepository(DB::connection());
    }

    public function test_upsert_pending_inserts_row(): void
    {
        $this->repo->upsertPending('EVT-001');

        $row = DB::table('event_sync_status')->where('event_id', 'EVT-001')->first();
        $this->assertNotNull($row);
        $this->assertSame('pending', $row->sync_status);
        $this->assertSame(0, (int) $row->last_successful_batch);
    }

    public function test_upsert_pending_is_no_op_on_conflict(): void
    {
        $this->repo->upsertPending('EVT-001');
        // manually update status to in_progress to confirm it stays after second upsertPending
        DB::table('event_sync_status')
            ->where('event_id', 'EVT-001')
            ->update(['sync_status' => 'in_progress']);

        // Second call must not overwrite
        $this->repo->upsertPending('EVT-001');

        $row = DB::table('event_sync_status')->where('event_id', 'EVT-001')->first();
        $this->assertSame('in_progress', $row->sync_status, 'upsertPending must be a no-op when row exists');
    }

    public function test_find_returns_null_for_unknown_event_id(): void
    {
        $result = $this->repo->find('NONEXISTENT');
        $this->assertNull($result);
    }

    public function test_find_returns_dto_for_existing_event(): void
    {
        $this->repo->upsertPending('EVT-002');

        $dto = $this->repo->find('EVT-002');

        $this->assertNotNull($dto);
        $this->assertSame('EVT-002', $dto->event_id);
        $this->assertSame('pending', $dto->sync_status);
        $this->assertSame(0, $dto->last_successful_batch);
    }

    public function test_mark_in_progress_sets_status_and_total_batches(): void
    {
        $this->repo->upsertPending('EVT-003');
        $this->repo->markInProgress('EVT-003', 5);

        $row = DB::table('event_sync_status')->where('event_id', 'EVT-003')->first();
        $this->assertSame('in_progress', $row->sync_status);
        $this->assertSame(5, (int) $row->total_batches);
    }

    public function test_record_batch_success_updates_last_successful_batch(): void
    {
        $this->repo->upsertPending('EVT-004');
        $this->repo->markInProgress('EVT-004', 3);
        $this->repo->recordBatchSuccess('EVT-004', 2);

        $row = DB::table('event_sync_status')->where('event_id', 'EVT-004')->first();
        $this->assertSame(2, (int) $row->last_successful_batch);
        $this->assertSame('in_progress', $row->sync_status);
    }

    public function test_record_complete_sets_status_and_completed_at(): void
    {
        $this->repo->upsertPending('EVT-005');
        $this->repo->markInProgress('EVT-005', 2);
        $this->repo->recordComplete('EVT-005');

        $row = DB::table('event_sync_status')->where('event_id', 'EVT-005')->first();
        $this->assertSame('complete', $row->sync_status);
        $this->assertNotNull($row->completed_at);
    }

    public function test_record_failed_sets_status_and_error_message(): void
    {
        $this->repo->upsertPending('EVT-006');
        $this->repo->markInProgress('EVT-006', 2);
        $this->repo->recordFailed('EVT-006', 'HTTP 500: Internal Server Error');

        $row = DB::table('event_sync_status')->where('event_id', 'EVT-006')->first();
        $this->assertSame('failed', $row->sync_status);
        $this->assertSame('HTTP 500: Internal Server Error', $row->error_message);
    }

    public function test_unique_constraint_on_event_id(): void
    {
        $this->repo->upsertPending('EVT-007');

        $this->expectException(\Exception::class);

        // Raw insert should throw on duplicate event_id
        DB::table('event_sync_status')->insert([
            'event_id'   => 'EVT-007',
            'sync_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
