<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Integration test: partial failure then retry (task 16.2)
 *
 * Requirements: 6.1, 6.2, 7.3
 *
 * @group c3-post-event-sync
 */
class RetryIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private const EVENT_ID = 'RETRY-EVT-001';
    private const SECRET   = 'test-shared-secret-for-phpunit';

    private function makeRecords(int $count): array
    {
        return array_map(
            fn (int $i) => new CheckedInAttendeeDTO(
                "TICKET-{$i}",
                '2026-06-15T09:14:23Z',
                'Gate A',
                'staff-001',
                'qr_scan',
            ),
            range(1, $count)
        );
    }

    private function seedEventSyncStatus(
        string $status,
        int $lastBatch = 0,
        ?int $totalBatches = null
    ): void {
        DB::table('event_sync_status')->insert([
            'event_id'              => self::EVENT_ID,
            'sync_status'           => $status,
            'last_successful_batch' => $lastBatch,
            'total_batches'         => $totalBatches,
            'created_at'            => now(),
            'updated_at'            => now(),
        ]);
    }

    /**
     * Scenario: 3000 records (3 batches), batch 3 fails permanently.
     * Expect: sync_status=failed, last_successful_batch=2.
     * Then retry: only batch 3 dispatched, sync_status=complete.
     */
    public function test_partial_failure_then_retry_resumes_from_correct_batch(): void
    {
        $n = 3000; // 3 batches of 1000
        $this->seedEventSyncStatus('pending');

        // Single Http::fake with a mutable reference — avoids stub accumulation
        // when Http::fake() is called multiple times inside a single test.
        $totalCallCount  = 0;
        $phase2Active    = false;
        $phase2CallCount = 0;
        Http::fake([
            '*' => function () use (&$totalCallCount, &$phase2Active, &$phase2CallCount) {
                $totalCallCount++;
                if ($phase2Active) {
                    // Phase 2: all requests succeed; track how many calls this phase makes
                    $phase2CallCount++;
                    return Http::response(['succeeded' => 1000, 'failed' => 0, 'total' => 1000, 'failures' => []], 200);
                }
                // Phase 1: first 2 calls succeed, 3rd+ fail with 500
                if ($totalCallCount <= 2) {
                    return Http::response(['succeeded' => 1000, 'failed' => 0, 'total' => 1000, 'failures' => []], 200);
                }
                return Http::response('Internal Server Error', 500);
            },
        ]);

        // Bind mocked attendee repo (returns 3000 records = 3 batches)
        $attendeeRepo = $this->createMock(CheckedInAttendeeRepository::class);
        $attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords($n));
        $this->app->instance(CheckedInAttendeeRepository::class, $attendeeRepo);

        // Bind mock event finder
        $eventFinder = $this->createMock(\App\Features\PostEventSync\Contracts\EventFinderContract::class);
        $eventFinder->method('findEligible')->willReturn([self::EVENT_ID]);
        $this->app->instance(\App\Features\PostEventSync\Contracts\EventFinderContract::class, $eventFinder);

        // Run the scheduler command — fails on batch 3 (caught per-event, returns exit 0)
        $this->artisan('checkin:post-event-sync')->assertExitCode(0);

        // Verify failed state
        $row = DB::table('event_sync_status')->where('event_id', self::EVENT_ID)->first();
        $this->assertSame('failed', $row->sync_status, 'After batch 3 failure, sync_status must be failed');
        $this->assertSame(2, (int) $row->last_successful_batch, 'last_successful_batch must be 2');

        // Phase 2: flip the flag — the same closure registered above now returns 200 for all.
        // The retry will fetch all 3000 records, re-partition to 3 batches,
        // skip batches 1+2 (last_successful_batch=2), and only dispatch batch 3.
        $phase2Active = true;

        $this->postJson(
            '/internal/checkin/retry-sync/' . self::EVENT_ID,
            [],
            ['Authorization' => 'Bearer ' . self::SECRET]
        )
            ->assertStatus(200)
            ->assertJson([
                'event_id'            => self::EVENT_ID,
                'status'              => 'retry_queued',
                'starting_from_batch' => 3,
            ]);

        // Verify complete state
        $row = DB::table('event_sync_status')->where('event_id', self::EVENT_ID)->first();
        $this->assertSame('complete', $row->sync_status, 'After retry, sync_status must be complete');

        // Only batch 3 dispatched during retry (total_batches=3, last_successful=2 → 1 batch remaining)
        $this->assertSame(1, $phase2CallCount,
            "Retry should only dispatch batch 3, but {$phase2CallCount} C2 calls were made");
    }

    public function test_retry_endpoint_returns_409_when_already_complete(): void
    {
        $this->seedEventSyncStatus('complete', 3, 3);

        // Bind a real attendee repo that won't be called
        $attendeeRepo = $this->createMock(CheckedInAttendeeRepository::class);
        $attendeeRepo->expects($this->never())->method('fetchCheckedIn');
        $this->app->instance(CheckedInAttendeeRepository::class, $attendeeRepo);

        $this->postJson(
            '/internal/checkin/retry-sync/' . self::EVENT_ID,
            [],
            ['Authorization' => 'Bearer ' . self::SECRET]
        )
            ->assertStatus(409)
            ->assertJson(['error' => 'sync_already_complete']);
    }

    public function test_retry_endpoint_returns_409_when_in_progress(): void
    {
        $this->seedEventSyncStatus('in_progress', 1, 3);

        $this->postJson(
            '/internal/checkin/retry-sync/' . self::EVENT_ID,
            [],
            ['Authorization' => 'Bearer ' . self::SECRET]
        )
            ->assertStatus(409)
            ->assertJson(['error' => 'sync_already_in_progress']);
    }
}
