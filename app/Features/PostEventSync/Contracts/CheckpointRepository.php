<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Contracts;

use App\Features\PostEventSync\DTOs\EventSyncStatusDTO;

interface CheckpointRepository
{
    /**
     * Insert a pending row for the given event.
     * No-op if a row already exists (idempotent INSERT … ON CONFLICT DO NOTHING).
     */
    public function upsertPending(string $eventId): void;

    /**
     * Transition the event's sync_status from pending → in_progress and record
     * the total number of batches that will be dispatched.
     */
    public function markInProgress(string $eventId, int $totalBatches): void;

    /**
     * Atomically set last_successful_batch = $batchNumber and confirm that
     * sync_status remains in_progress after each successfully dispatched batch.
     */
    public function recordBatchSuccess(string $eventId, int $batchNumber): void;

    /**
     * Mark the event sync as fully complete: set sync_status = complete and
     * completed_at = NOW().
     */
    public function recordComplete(string $eventId): void;

    /**
     * Mark the event sync as permanently failed: set sync_status = failed and
     * persist the human-readable error message for investigation.
     */
    public function recordFailed(string $eventId, string $message): void;

    /**
     * Read the current checkpoint row for the given event.
     * Returns null if no row has been inserted yet.
     */
    public function find(string $eventId): ?EventSyncStatusDTO;
}
