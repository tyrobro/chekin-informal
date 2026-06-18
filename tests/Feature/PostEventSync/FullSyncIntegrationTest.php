<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\Contracts\EventFinderContract;
use App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO;
use App\Features\PostEventSync\Services\PostEventSyncOrchestrator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Integration test: full automatic sync (task 16.1)
 *
 * Mocks Supabase fetchCheckedIn and C2 endpoint.
 * Verifies sync_status = complete and last_successful_batch = ceil(N/1000).
 *
 * Requirements: 1.1, 5.2
 *
 * @group c3-post-event-sync
 */
class FullSyncIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private const EVENT_ID = 'INTEGRATION-EVT-001';
    private const SECRET   = 'test-shared-secret-for-phpunit';

    private function seedEventSyncStatus(string $status = 'pending'): void
    {
        DB::table('event_sync_status')->insert([
            'event_id'              => self::EVENT_ID,
            'sync_status'           => $status,
            'last_successful_batch' => 0,
            'created_at'            => now(),
            'updated_at'            => now(),
        ]);
    }

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

    public function test_full_sync_completes_successfully_for_small_batch(): void
    {
        $this->seedEventSyncStatus('pending');

        // Mock C2 to return 200 for all batches
        Http::fake(['*' => Http::response(['succeeded' => 100, 'failed' => 0, 'total' => 100, 'failures' => []], 200)]);

        // Mock the attendee repository to return 100 records (1 batch)
        $attendeeRepo = $this->createMock(CheckedInAttendeeRepository::class);
        $attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(100));
        $this->app->instance(CheckedInAttendeeRepository::class, $attendeeRepo);

        // Mock the event finder to return our test event
        $eventFinder = $this->createMock(EventFinderContract::class);
        $eventFinder->method('findEligible')->willReturn([self::EVENT_ID]);
        $this->app->instance(EventFinderContract::class, $eventFinder);

        // Run the command
        $this->artisan('checkin:post-event-sync')->assertExitCode(0);

        // Verify event_sync_status is now complete
        $row = DB::table('event_sync_status')->where('event_id', self::EVENT_ID)->first();
        $this->assertNotNull($row, 'event_sync_status row must exist');
        $this->assertSame('complete', $row->sync_status);
        $this->assertSame(1, (int) $row->last_successful_batch);
        $this->assertNotNull($row->completed_at);
    }

    public function test_full_sync_completes_for_multi_batch_event(): void
    {
        $this->seedEventSyncStatus('pending');

        $n              = 2500;
        $expectedBatches = (int) ceil($n / 1000); // 3

        Http::fake(['*' => Http::response(['succeeded' => 1000, 'failed' => 0, 'total' => 1000, 'failures' => []], 200)]);

        $attendeeRepo = $this->createMock(CheckedInAttendeeRepository::class);
        $attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords($n));
        $this->app->instance(CheckedInAttendeeRepository::class, $attendeeRepo);

        $eventFinder = $this->createMock(EventFinderContract::class);
        $eventFinder->method('findEligible')->willReturn([self::EVENT_ID]);
        $this->app->instance(EventFinderContract::class, $eventFinder);

        $this->artisan('checkin:post-event-sync')->assertExitCode(0);

        $row = DB::table('event_sync_status')->where('event_id', self::EVENT_ID)->first();
        $this->assertSame('complete', $row->sync_status);
        $this->assertSame($expectedBatches, (int) $row->last_successful_batch);
        $this->assertSame($expectedBatches, (int) $row->total_batches);
    }

    public function test_zero_checkins_marks_complete_without_c2_calls(): void
    {
        $this->seedEventSyncStatus('pending');

        // Ensure Http is faked but should never be called
        Http::fake(['*' => Http::response([], 200)]);

        $attendeeRepo = $this->createMock(CheckedInAttendeeRepository::class);
        $attendeeRepo->method('fetchCheckedIn')->willReturn([]);
        $this->app->instance(CheckedInAttendeeRepository::class, $attendeeRepo);

        $eventFinder = $this->createMock(EventFinderContract::class);
        $eventFinder->method('findEligible')->willReturn([self::EVENT_ID]);
        $this->app->instance(EventFinderContract::class, $eventFinder);

        $this->artisan('checkin:post-event-sync')->assertExitCode(0);

        $row = DB::table('event_sync_status')->where('event_id', self::EVENT_ID)->first();
        $this->assertSame('complete', $row->sync_status);

        Http::assertNothingSent();
    }

    public function test_scheduler_downtime_recovery_processes_on_next_tick(): void
    {
        // Simulate an event that was NOT processed (pending, not in_progress)
        $this->seedEventSyncStatus('pending');

        Http::fake(['*' => Http::response(['succeeded' => 1, 'failed' => 0, 'total' => 1, 'failures' => []], 200)]);

        $attendeeRepo = $this->createMock(CheckedInAttendeeRepository::class);
        $attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(1));
        $this->app->instance(CheckedInAttendeeRepository::class, $attendeeRepo);

        $eventFinder = $this->createMock(EventFinderContract::class);
        $eventFinder->method('findEligible')->willReturn([self::EVENT_ID]);
        $this->app->instance(EventFinderContract::class, $eventFinder);

        // Next tick picks it up
        $this->artisan('checkin:post-event-sync')->assertExitCode(0);

        $row = DB::table('event_sync_status')->where('event_id', self::EVENT_ID)->first();
        $this->assertSame('complete', $row->sync_status, 'Pending event must be processed on next tick');
    }
}
