<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Repositories;

use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\DTOs\EventSyncStatusDTO;
use Illuminate\Database\ConnectionInterface;

class PostgresCheckpointRepository implements CheckpointRepository
{
    public function __construct(private readonly ConnectionInterface $db) {}

    /**
     * Insert a pending row for the given event.
     * No-op if a row already exists (idempotent INSERT … ON CONFLICT DO NOTHING).
     *
     * Requirements: 8.1, 5.5
     */
    public function upsertPending(string $eventId): void
    {
        $this->db->statement(
            'INSERT INTO event_sync_status (event_id, sync_status, created_at, updated_at)
             VALUES (?, \'pending\', NOW(), NOW())
             ON CONFLICT (event_id) DO NOTHING',
            [$eventId]
        );
    }

    /**
     * Transition the event's sync_status from pending → in_progress and record
     * the total number of batches that will be dispatched.
     *
     * Requirements: 8.2, 8.3, 5.4
     */
    public function markInProgress(string $eventId, int $totalBatches): void
    {
        $this->db->statement(
            'UPDATE event_sync_status
             SET sync_status = \'in_progress\', total_batches = ?, updated_at = NOW()
             WHERE event_id = ?',
            [$totalBatches, $eventId]
        );
    }

    /**
     * Atomically set last_successful_batch = $batchNumber and confirm that
     * sync_status remains in_progress after each successfully dispatched batch.
     *
     * Requirements: 5.1, 5.4
     */
    public function recordBatchSuccess(string $eventId, int $batchNumber): void
    {
        $this->db->statement(
            'UPDATE event_sync_status
             SET last_successful_batch = ?, sync_status = \'in_progress\', updated_at = NOW()
             WHERE event_id = ?',
            [$batchNumber, $eventId]
        );
    }

    /**
     * Mark the event sync as fully complete: set sync_status = complete and
     * completed_at = NOW().
     *
     * Requirements: 5.2, 5.4
     */
    public function recordComplete(string $eventId): void
    {
        $this->db->statement(
            'UPDATE event_sync_status
             SET sync_status = \'complete\', completed_at = NOW(), updated_at = NOW()
             WHERE event_id = ?',
            [$eventId]
        );
    }

    /**
     * Mark the event sync as permanently failed: set sync_status = failed and
     * persist the human-readable error message for investigation.
     *
     * Requirements: 5.3, 5.4
     */
    public function recordFailed(string $eventId, string $message): void
    {
        $this->db->statement(
            'UPDATE event_sync_status
             SET sync_status = \'failed\', error_message = ?, updated_at = NOW()
             WHERE event_id = ?',
            [$message, $eventId]
        );
    }

    /**
     * Read the current checkpoint row for the given event.
     * Returns null if no row has been inserted yet.
     *
     * Requirements: 8.1, 8.2, 8.3
     */
    public function find(string $eventId): ?EventSyncStatusDTO
    {
        $row = $this->db->selectOne(
            'SELECT event_id, sync_status, last_successful_batch, total_batches,
                    completed_at, error_message
             FROM event_sync_status
             WHERE event_id = ?',
            [$eventId]
        );

        if ($row === null) {
            return null;
        }

        return EventSyncStatusDTO::fromRow((array) $row);
    }
}
