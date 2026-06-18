<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Contracts;

interface CheckedInAttendeeRepository
{
    /**
     * Fetch all tickets for $eventId where checked_in_at IS NOT NULL from Supabase.
     * Returns an empty array if no check-ins exist for the event.
     *
     * @return \App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO[]
     */
    public function fetchCheckedIn(string $eventId): array;
}
