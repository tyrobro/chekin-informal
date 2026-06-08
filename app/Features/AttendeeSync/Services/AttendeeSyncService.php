<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Services;

use App\Features\AttendeeSync\Contracts\EventPreparationRepository;
use App\Features\AttendeeSync\DTOs\EventPreparationDTO;
use App\Features\AttendeeSync\DTOs\PrepareResponseDTO;
use App\Features\AttendeeSync\Jobs\AttendeeSyncJob;
use Carbon\Carbon;
use Illuminate\Support\Str;

class AttendeeSyncService
{
    public function __construct(
        private readonly EventPreparationRepository $prepRepo,
        private readonly AdvisoryLockService        $lockService,
    ) {}

    /**
     * Trigger the attendee sync pipeline for the given event.
     *
     * Steps:
     *   1. Attempt to acquire a non-blocking PostgreSQL advisory lock on event_id.
     *      Returns null if the lock is already held (caller returns 409).
     *   2. Upsert an in_progress EventPreparation_Record.
     *   3. Dispatch AttendeeSyncJob to the queue.
     *   4. Return PrepareResponseDTO with sync_id and status=queued.
     *
     * Requirements: 2.1, 2.6, 2.7, 3.1, 3.2, 3.4
     *
     * @return PrepareResponseDTO|null  null means lock already held → return 409
     */
    public function prepare(int $eventId): ?PrepareResponseDTO
    {
        // Step 1: Non-blocking advisory lock — returns false immediately if held
        if (! $this->lockService->tryAcquire($eventId)) {
            return null; // Caller maps null → HTTP 409
        }

        $syncId   = Str::uuid()->toString();
        $queuedAt = Carbon::now()->toIso8601String();

        // Step 2: Write in_progress record so status is visible before the job runs
        $this->prepRepo->upsert(EventPreparationDTO::inProgress($eventId, $syncId));

        // Step 3: Dispatch job to the queue (non-blocking)
        AttendeeSyncJob::dispatch($eventId, $syncId, $queuedAt)->onQueue('attendee-sync');

        // Step 4: Return immediately with 202 payload
        return PrepareResponseDTO::make($syncId, 'queued');
    }
}
