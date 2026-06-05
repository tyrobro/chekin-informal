<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Jobs;

use App\Features\AttendeeSync\Contracts\EventPreparationRepository;
use App\Features\AttendeeSync\Contracts\ExplaraXAttendeeRepository;
use App\Features\AttendeeSync\Contracts\HmacKeyRepository;
use App\Features\AttendeeSync\DTOs\AttendeeUpsertDTO;
use App\Features\AttendeeSync\DTOs\EventPreparationDTO;
use App\Features\AttendeeSync\Services\AdvisoryLockService;
use App\Features\AttendeeSync\Services\QrTokenService;
use App\Features\AttendeeSync\Services\SupabaseUpsertService;
use App\Features\AttendeeSync\Services\SyncLogger;
use App\Features\AttendeeSync\Support\BatchPartitioner;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class AttendeeSyncJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * Retry logic is handled internally (batch-level), so the job itself has 1 attempt.
     */
    public int $tries = 1;

    /**
     * 6 minutes — enough for 10K attendees in batches of 1,000 with retry headroom.
     */
    public int $timeout = 360;

    public function __construct(
        private readonly int    $eventId,
        private readonly string $syncId,
        private readonly string $queuedAt,
    ) {}

    /**
     * Execute the attendee sync pipeline:
     *   1. Log sync.started
     *   2. Fetch all attendees from ExplaraX
     *   3. Get or create per-event HMAC key
     *   4. Sign each attendee → AttendeeUpsertDTO
     *   5. Partition into batches and upsert to Supabase
     *   6. Write EventPreparation_Record (status=completed)
     *   7. Release advisory lock, log sync.completed
     *
     * On any unrecoverable exception, writes status=failed and rethrows.
     *
     * Requirements: 4.1–4.5, 5.1–5.6, 6.1–6.7, 7.1–7.3, 8.1–8.5, 11.2–11.6
     */
    public function handle(
        ExplaraXAttendeeRepository $attendeeRepo,
        SupabaseUpsertService      $supabaseService,
        HmacKeyRepository          $hmacRepo,
        EventPreparationRepository $prepRepo,
        AdvisoryLockService        $lockService,
        QrTokenService             $qrTokenService,
    ): void {
        $logger    = new SyncLogger($this->syncId, $this->eventId);
        $startedAt = Carbon::now();

        // Step 1: Log sync started
        $logger->started($this->queuedAt);

        try {
            // Step 2: Fetch all attendees from ExplaraX Payments API (handles pagination + retries)
            $attendeeDtos = $attendeeRepo->fetchAllForEvent($this->eventId);
            $totalCount   = count($attendeeDtos);

            // Step 3: Get or create stable per-event HMAC key
            $hmacKey = $hmacRepo->getOrCreate($this->eventId);

            // Step 4: Sign each attendee to produce AttendeeUpsertDTO[]
            $upsertDtos = array_map(
                static fn ($dto) => AttendeeUpsertDTO::fromAttendeeDTO(
                    $dto,
                    $qrTokenService->sign($dto->ticket_id, $hmacKey)
                ),
                $attendeeDtos
            );
            // Immediately clear the HMAC key from memory
            unset($hmacKey);

            // Step 5: Partition into batches and upsert each
            $batchSize = (int) env('SYNC_BATCH_SIZE', 1000);
            $batches   = BatchPartitioner::partition($upsertDtos, $batchSize);
            $totalBatches = count($batches);

            foreach ($batches as $batchIndex => $batch) {
                $batchNumber  = $batchIndex + 1;
                $batchStartMs = (int) (microtime(true) * 1000);

                // Convert DTOs to plain arrays for the HTTP payload (9 fields, no PII)
                $rows = array_map(static fn ($dto) => $dto->toUpsertArray(), $batch);

                $supabaseService->upsertBatch($batchNumber, $rows);

                $durationMs = (int) (microtime(true) * 1000) - $batchStartMs;
                $logger->batchCompleted($batchNumber, count($batch), $durationMs);
            }

            // Step 6: Write EventPreparation_Record with status=completed
            $prepRepo->upsert(
                EventPreparationDTO::completed($this->eventId, $this->syncId, $totalCount, $totalBatches)
            );

            // Step 7: Release advisory lock and log completion
            $lockService->release($this->eventId);
            $totalMs = (int) $startedAt->diffInMilliseconds(Carbon::now());
            $logger->completed($totalCount, $totalBatches, $totalMs);

        } catch (\Throwable $e) {
            // Write failed record, release lock, log failure, then rethrow
            try {
                $prepRepo->upsert(
                    EventPreparationDTO::failed($this->eventId, $this->syncId, $e->getMessage())
                );
            } catch (\Throwable) {
                // Best-effort: if we can't write the failure record, just log it
            }

            $lockService->release($this->eventId);
            $logger->failed(0, $e->getMessage());

            throw $e;
        }
    }
}
