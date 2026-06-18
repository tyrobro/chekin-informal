<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Services;

use App\Features\AttendeeSync\Support\BatchPartitioner;
use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\DTOs\SyncBatchDTO;

/**
 * Orchestrates the full post-event sync-back pipeline for a single event.
 *
 * Pipeline steps:
 *   1. upsertPending — idempotent insert; no-op if row already exists
 *   2. fetchCheckedIn — retrieve all checked-in attendees from Supabase
 *   3. If zero records → recordComplete and return (no batches needed)
 *   4. partition via BatchPartitioner (1,000 per batch, reused from C1)
 *   5. markInProgress with total batch count
 *   6. For each batch → SyncBackDispatcher::dispatch()
 *   7. recordComplete
 *
 * The PostEventSyncLogger is created externally (per-run, not container-bound)
 * and passed to run() — this keeps the container from trying to resolve primitive
 * string constructor args on the logger.
 *
 * Permanent batch failures propagate as PostEventSyncException — NOT caught here.
 * PostEventSyncCommand catches them per-event so one failure does not block others.
 *
 * Requirements: 2.3, 3.1, 3.4, 8.1, 8.2, 8.3
 */
class PostEventSyncOrchestrator
{
    private const BATCH_SIZE = 1000;

    public function __construct(
        private readonly CheckedInAttendeeRepository $attendeeRepo,
        private readonly CheckpointRepository        $checkpointRepo,
        private readonly SyncBackDispatcher          $dispatcher,
    ) {}

    /**
     * Run the complete sync-back pipeline for $eventId.
     *
     * @param PostEventSyncLogger $logger Per-run logger (not container-resolved)
     * @throws \App\Features\PostEventSync\Exceptions\PostEventSyncException
     *         on permanent batch dispatch failure — propagates to the caller
     */
    public function run(string $eventId, string $correlationId, PostEventSyncLogger $logger): void
    {
        $startTime = microtime(true);

        // Step 1: Ensure a checkpoint row exists (idempotent)
        $this->checkpointRepo->upsertPending($eventId);
        $logger->syncStarted();

        // Step 2: Fetch all checked-in attendees from Supabase
        $records = $this->attendeeRepo->fetchCheckedIn($eventId);

        // Step 3: No check-ins — mark complete immediately, no C2 calls
        if (empty($records)) {
            $this->checkpointRepo->recordComplete($eventId);
            $logger->syncCompleted(0, (int) round((microtime(true) - $startTime) * 1000));
            return;
        }

        // Step 4: Partition into 1,000-record batches (reuse C1 BatchPartitioner)
        $batches      = BatchPartitioner::partition($records, self::BATCH_SIZE);
        $totalBatches = count($batches);

        // Step 5: Transition to in_progress with total batch count recorded
        $this->checkpointRepo->markInProgress($eventId, $totalBatches);

        // Step 6: Dispatch each batch — PostEventSyncException propagates on failure
        foreach ($batches as $index => $batchRecords) {
            $batchNumber = $index + 1; // 1-based
            $batchId     = SyncBackDispatcher::deriveBatchId($eventId, $batchNumber);

            $batch = new SyncBatchDTO(
                event_id:     $eventId,
                batch_number: $batchNumber,
                batch_id:     $batchId,
                records:      $batchRecords,
            );

            $this->dispatcher->dispatch($batch, $correlationId, $logger);
        }

        // Step 7: All batches succeeded — mark complete
        $durationMs = (int) round((microtime(true) - $startTime) * 1000);
        $this->checkpointRepo->recordComplete($eventId);
        $logger->syncCompleted($totalBatches, $durationMs);
    }
}
