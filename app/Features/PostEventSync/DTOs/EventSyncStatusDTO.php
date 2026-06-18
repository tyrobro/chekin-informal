<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\DTOs;

readonly class EventSyncStatusDTO
{
    /**
     * @param string      $event_id              The event identifier.
     * @param string      $sync_status           Current sync state.
     *                                            Valid values: pending|in_progress|complete|failed
     * @param int         $last_successful_batch Zero-based index of the last batch that was
     *                                            successfully delivered to C2. 0 means no
     *                                            batch has been delivered yet.
     * @param int|null    $total_batches         Total number of batches for this run, or null
     *                                            when the partitioning step has not completed.
     * @param string|null $completed_at          ISO 8601 UTC timestamp when the sync reached
     *                                            the 'complete' state, or null otherwise.
     * @param string|null $error_message         Human-readable error description when
     *                                            sync_status is 'failed', or null otherwise.
     */
    public function __construct(
        public string  $event_id,
        public string  $sync_status,
        public int     $last_successful_batch,
        public ?int    $total_batches,
        public ?string $completed_at,
        public ?string $error_message,
    ) {}

    /**
     * Construct from a raw `event_sync_status` database row (e.g. from `DB::select()`).
     *
     * Casts `last_successful_batch` and `total_batches` to `int` to handle
     * PDO string-typed columns from PostgreSQL. All nullable columns default
     * to `null` when absent from the row array.
     *
     * @param array{
     *   event_id: string,
     *   sync_status: string,
     *   last_successful_batch: int|string,
     *   total_batches: int|string|null,
     *   completed_at: string|null,
     *   error_message: string|null,
     * } $row Raw associative array from DB::select() or similar.
     */
    public static function fromRow(array $row): self
    {
        return new self(
            event_id:              (string) $row['event_id'],
            sync_status:           (string) $row['sync_status'],
            last_successful_batch: (int)    $row['last_successful_batch'],
            total_batches:         isset($row['total_batches']) ? (int) $row['total_batches'] : null,
            completed_at:          $row['completed_at'] ?? null,
            error_message:         $row['error_message'] ?? null,
        );
    }
}
