<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Contracts;

/**
 * Contract for append-only write access to the checkin_sync_errors table.
 *
 * Requirements: 5.2, 7.4
 */
interface SyncErrorRepository
{
    /**
     * Insert a batch of error rows in a single bulk INSERT statement.
     *
     * Each row must contain:
     *   - event_id  (string)
     *   - ticket_id (string)
     *   - reason    (string)
     *   - payload   (string — JSON-encoded CheckinRecord)
     *   - created_at (string — UTC datetime string)
     *
     * No-op when $errors is empty.
     *
     * @param array<int, array{event_id: string, ticket_id: string, reason: string, payload: string, created_at: string}> $errors
     */
    public function bulkInsert(array $errors): void;
}
