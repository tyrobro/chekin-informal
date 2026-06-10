<?php

declare(strict_types=1);

namespace App\Features\SyncBack\DTOs;

/**
 * Represents a single entry in the failures array of the sync-back response.
 *
 * Failures are records that could not be applied (e.g. ticket_id not found).
 * They are surfaced both in the HTTP response and logged to checkin_sync_errors.
 *
 * Requirements: 5.3, 6.1, 6.4 (Failure Array Completeness)
 */
readonly class FailureRecordDTO
{
    public function __construct(
        public string $ticket_id,
        public string $reason,
    ) {}

    /**
     * Serialise to array for inclusion in the JSON response failures array.
     *
     * @return array{ticket_id: string, reason: string}
     */
    public function toArray(): array
    {
        return [
            'ticket_id' => $this->ticket_id,
            'reason'    => $this->reason,
        ];
    }
}
