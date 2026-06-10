<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Contracts;

interface HmacKeyRepository
{
    /**
     * Return the existing HMAC key for the event, or generate and persist a new one.
     * The key is a 64-character lowercase hexadecimal string (HMAC-SHA256, 32 raw bytes).
     * This operation is atomic — concurrent calls for the same event_id are safe.
     *
     * @throws \RuntimeException if the key cannot be created or retrieved
     */
    public function getOrCreate(int $eventId): string;
}
