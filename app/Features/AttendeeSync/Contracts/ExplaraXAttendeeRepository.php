<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Contracts;

interface ExplaraXAttendeeRepository
{
    /**
     * Fetch all attendees for the given event from the ExplaraX Payments API.
     * Handles pagination automatically. PII is stripped before returning.
     *
     * @return \App\Features\AttendeeSync\DTOs\AttendeeDTO[]
     * @throws \App\Features\AttendeeSync\Exceptions\ExplaraXApiException
     */
    public function fetchAllForEvent(int $eventId): array;
}
