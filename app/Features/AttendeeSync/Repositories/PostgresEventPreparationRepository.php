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
}
