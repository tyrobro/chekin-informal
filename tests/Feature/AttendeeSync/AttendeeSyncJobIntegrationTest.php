<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\Contracts\EventPreparationRepository;
use App\Features\AttendeeSync\Contracts\ExplaraXAttendeeRepository;
use App\Features\AttendeeSync\Contracts\HmacKeyRepository;
use App\Features\AttendeeSync\DTOs\AttendeeDTO;
use App\Features\AttendeeSync\DTOs\EventPreparationDTO;
use App\Features\AttendeeSync\Jobs\AttendeeSyncJob;
use App\Features\AttendeeSync\Services\AdvisoryLockService;
use App\Features\AttendeeSync\Services\QrTokenService;
use App\Features\AttendeeSync\Services\SupabaseUpsertService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Tasks 16.4 — Full job execution with mocked dependencies.
 *
 * @group c1-attendee-sync
 */
class AttendeeSyncJobIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private function makeAttendeeDto(string $ticketId, int $eventId): AttendeeDTO
    {
        return new AttendeeDTO(
            ticket_id:     $ticketId,
            event_id:      $eventId,
            attendee_name: 'Test Attendee',
            ticket_type:   'General',
            company:       null,
            designation:   null,
            seat:          null,
            metadata:      [],
        );
    }

    /** Task 16.4 — Full job with 100 attendees, all deps mocked */
    public function test_job_completes_and_writes_preparation_record_for_100_attendees(): void
    {
        // Set batch size so all 100 attendees go in a single batch
        putenv('SYNC_BATCH_SIZE=1000');

        // Mock the Log facade so SyncLogger's Log::channel()->info() calls are swallowed
        Log::shouldReceive('channel')->andReturnSelf();
        Log::shouldReceive('info')->andReturn(null);

        $eventId = 204;
        $syncId  = Str::uuid()->toString();

        // Build 100 attendee DTOs
        $attendees = [];
        for ($i = 1; $i <= 100; $i++) {
            $attendees[] = $this->makeAttendeeDto("T{$i}", $eventId);
        }

        // Mock ExplaraX repo
        $attendeeRepo = $this->mock(ExplaraXAttendeeRepository::class);
        $attendeeRepo->shouldReceive('fetchAllForEvent')
            ->once()
            ->with($eventId)
            ->andReturn($attendees);

        // Mock HMAC key repo
        $hmacRepo = $this->mock(HmacKeyRepository::class);
        $hmacRepo->shouldReceive('getOrCreate')
            ->once()
            ->with($eventId)
            ->andReturn(str_repeat('a', 64));

        // Mock Supabase upsert (100 attendees = 1 batch with SYNC_BATCH_SIZE=1000)
        $supabaseService = $this->mock(SupabaseUpsertService::class);
        $supabaseService->shouldReceive('upsertBatch')
            ->once()
            ->andReturn();

        // Capture the completed EventPreparationDTO
        $capturedDto = null;
        $prepRepo    = $this->mock(EventPreparationRepository::class);
        $prepRepo->shouldReceive('upsert')
            ->andReturnUsing(function (EventPreparationDTO $dto) use (&$capturedDto) {
                if ($dto->status === 'completed') {
                    $capturedDto = $dto;
                }
            });
        $prepRepo->shouldReceive('updateProgress')->andReturn();

        // Mock advisory lock
        $lockService = $this->mock(AdvisoryLockService::class);
        $lockService->shouldReceive('release')->once();

        // Run the job synchronously
        $job = new AttendeeSyncJob($eventId, $syncId, now()->toIso8601String());
        $job->handle(
            $attendeeRepo,
            $supabaseService,
            $hmacRepo,
            $prepRepo,
            $lockService,
            new QrTokenService(),
        );

        // Assert completion record
        $this->assertNotNull($capturedDto, 'EventPreparationDTO must be written on success');
        $this->assertSame('completed', $capturedDto->status);
        $this->assertSame(100, $capturedDto->attendee_count);
        $this->assertSame(1, $capturedDto->batch_count);
        $this->assertNotNull($capturedDto->prepared_at);
        $this->assertSame($syncId, $capturedDto->sync_id);
        $this->assertSame($eventId, $capturedDto->event_id);
    }
}
