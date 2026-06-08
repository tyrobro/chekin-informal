<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Contracts;

interface EventPreparationRepository
{
    /**
     * Upsert the event preparation record in ExplaraX core PostgreSQL.
     * Uses event_id as the conflict key. Wraps the write in a DB transaction.
     *
     * @throws \RuntimeException if the transaction fails
     */
    public function upsert(\App\Features\AttendeeSync\DTOs\EventPreparationDTO $dto): void;
}
