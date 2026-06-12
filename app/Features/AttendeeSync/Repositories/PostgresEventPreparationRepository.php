<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Repositories;

use App\Features\AttendeeSync\Contracts\EventPreparationRepository;
use App\Features\AttendeeSync\DTOs\EventPreparationDTO;
use Illuminate\Support\Facades\DB;

class PostgresEventPreparationRepository implements EventPreparationRepository
{
    /**
     * Upsert the event preparation record using event_id as the conflict key.
     * Wrapped in a DB transaction for atomicity.
     *
     * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
     */
    public function upsert(EventPreparationDTO $dto): void
    {
        DB::transaction(function () use ($dto): void {
            DB::statement(
                'INSERT INTO event_preparations
                    (event_id, sync_id, status, prepared_at, attendee_count, batch_count, error_message, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                 ON CONFLICT (event_id) DO UPDATE SET
                    sync_id        = EXCLUDED.sync_id,
                    status         = EXCLUDED.status,
                    prepared_at    = EXCLUDED.prepared_at,
                    attendee_count = EXCLUDED.attendee_count,
                    batch_count    = EXCLUDED.batch_count,
                    error_message  = EXCLUDED.error_message,
                    updated_at     = NOW()',
                [
                    $dto->event_id,
                    $dto->sync_id,
                    $dto->status,
                    $dto->prepared_at,
                    $dto->attendee_count,
                    $dto->batch_count,
                    $dto->error_message,
                ]
            );
        });
    }

    /**
     * Fetch the most-recent preparation record for the given event.
     * Returns null if no record exists yet.
     */
    public function findByEventId(int $eventId): ?EventPreparationDTO
    {
        $row = DB::table('event_preparations')
            ->where('event_id', $eventId)
            ->orderByDesc('updated_at')
            ->first([
                'event_id',
                'sync_id',
                'status',
                'prepared_at',
                'attendee_count',
                'batch_count',
                'error_message',
            ]);

        if ($row === null) {
            return null;
        }

        return new EventPreparationDTO(
            event_id:       (int) $row->event_id,
            sync_id:        (string) $row->sync_id,
            status:         (string) $row->status,
            prepared_at:    isset($row->prepared_at) ? (string) $row->prepared_at : null,
            attendee_count: isset($row->attendee_count) ? (int) $row->attendee_count : null,
            batch_count:    isset($row->batch_count) ? (int) $row->batch_count : null,
            error_message:  isset($row->error_message) ? (string) $row->error_message : null,
        );
    }

    /**
     * Increment the live processed count after each batch completes.
     * Only touches attendee_count and updated_at — leaves status unchanged.
     * Used by AttendeeSyncJob to stream real-time progress to the status endpoint.
     */
    public function updateProgress(int $eventId, int $processed): void
    {
        DB::table('event_preparations')
            ->where('event_id', $eventId)
            ->update([
                'attendee_count' => $processed,
                'updated_at'     => now(),
            ]);
    }
}
