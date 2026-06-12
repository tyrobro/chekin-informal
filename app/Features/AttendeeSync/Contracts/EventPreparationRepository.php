<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Contracts;

use App\Features\AttendeeSync\DTOs\EventPreparationDTO;

interface EventPreparationRepository
{
    /**
     * Upsert the event preparation record in ExplaraX core PostgreSQL.
     * Uses event_id as the conflict key. Wraps the write in a DB transaction.
     *
     * @throws \RuntimeException if the transaction fails
     */
    public function upsert(EventPreparationDTO $dto): void;

    /**
     * Fetch the most-recent preparation record for the given event.
     * Returns null if no record exists yet.
     */
    public function findByEventId(int $eventId): ?EventPreparationDTO;

    /**
     * Update only the processed-count columns without touching status/timestamps.
     * Used by AttendeeSyncJob to stream live progress after each batch.
     */
    public function updateProgress(int $eventId, int $processed): void;
}
