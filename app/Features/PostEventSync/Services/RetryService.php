<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Services;

use App\Features\AttendeeSync\Support\BatchPartitioner;
use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\DTOs\SyncBatchDTO;
use App\Features\PostEventSync\Exceptions\SyncAlreadyCompleteException;
use App\Features\PostEventSync\Exceptions\SyncAlreadyInProgressException;

/**
 * Handles manual retry of a failed (or pending) sync-back run.
 *
 * Resume behaviour:
 *   - Reads last_successful_batch from the checkpoint
 *   - Begins dispatching from batch (last_successful_batch + 1)
 *   - Never restarts from batch 1 if last_successful_batch > 0
 *   - If last_successful_batch = 0, dispatches from batch 1
 *
 * Guard conditions (mapped to HTTP 409 by PostEventSyncServiceProvider):
 *   - sync_status = 'complete'    → SyncAlreadyCompleteException
 *   - sync_status = 'in_progress' → SyncAlreadyInProgressException
 *
 * Idempotency: because batch_id is deterministic (hash of event_id + batch_number),
 * batches already applied will be deduplicated by the C2 endpoint.
 *
 * The PostEventSyncLogger is created by the caller (RetryService creates it
 * internally here using the provided correlationId and eventId) to avoid
 * container primitive-resolution errors.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
class RetryService
{
    private const BATCH_SIZE = 1000;

    public function __construct(
        private readonly CheckpointRepository        $checkpointRepo,
        private readonly CheckedInAttendeeRepository $attendeeRepo,
        private readonly SyncBackDispatcher          $dispatcher,
    ) {}

    /**
     * Retry a failed (or pending) sync-back for the given event.
     *
     * @return int The batch number the retry started from (last_successful_batch + 1)
     *
     * @throws SyncAlreadyCompleteException   if sync_status = 'complete'
     * @throws SyncAlreadyInProgressException if sync_status = 'in_progress'
     * @throws \App\Features\PostEventSync\Exceptions\PostEventSyncException on dispatch failure
     */
    public function retry(string $eventId, string $correlationId): int
    {
        // Create a per-run logger (not container-resolved — holds primitive args)
        $logger = new PostEventSyncLogger($correlationId, $eventId);

        // Step 1: Read current checkpoint
        $dto = $this->checkpointRepo->find($eventId);

        // Step 2: Guard — already complete
        if ($dto !== null && $dto->sync_status === 'complete') {
            $logger->syncFailed('Retry rejected: sync already complete');
            throw new SyncAlreadyCompleteException(
                "Sync for event {$eventId} is already complete."
            );
        }

        // Step 3: Guard — already in progress (concurrent sync running)
        if ($dto !== null && $dto->sync_status === 'in_progress') {
            $logger->syncFailed('Retry rejected: sync already in progress');
            throw new SyncAlreadyInProgressException(
                "Sync for event {$eventId} is already in progress."
            );
        }

        $lastSuccessful = $dto?->last_successful_batch ?? 0;
        $startFromBatch = $lastSuccessful + 1; // 1-based; if 0 → start from 1

        $logger->syncStarted();

        // Step 4: Re-fetch all checked-in records (Supabase is source of truth)
        $records      = $this->attendeeRepo->fetchCheckedIn($eventId);
        $batches      = BatchPartitioner::partition($records, self::BATCH_SIZE);
        $totalBatches = count($batches);

        // Step 5: Transition to in_progress atomically before first dispatch
        $this->checkpointRepo->markInProgress($eventId, $totalBatches);

        // Step 6: Dispatch from last_successful_batch + 1 only
        // Batches 1..(startFromBatch-1) already succeeded; skip them entirely.
        // If re-sent, C2 would deduplicate them via batch_id idempotency anyway.
        for ($batchNumber = $startFromBatch; $batchNumber <= $totalBatches; $batchNumber++) {
            $batchIndex  = $batchNumber - 1; // 0-based array index
            $batchRecords = $batches[$batchIndex] ?? [];

            $batchId = SyncBackDispatcher::deriveBatchId($eventId, $batchNumber);

            $batch = new SyncBatchDTO(
                event_id:     $eventId,
                batch_number: $batchNumber,
                batch_id:     $batchId,
                records:      $batchRecords,
            );

            $this->dispatcher->dispatch($batch, $correlationId, $logger);
        }

        // Step 7: All retry batches succeeded
        $this->checkpointRepo->recordComplete($eventId);
        $logger->syncCompleted($totalBatches, 0);

        // Step 8: Return the batch number we started from
        return $startFromBatch;
    }
}
