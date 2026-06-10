<?php

declare(strict_types=1);

namespace App\Features\SyncBack\DTOs;

/**
 * Represents a single check-in record received from Supabase.
 *
 * All properties are readonly strings. The checked_in_at value is kept as an
 * ISO 8601 UTC string throughout the pipeline; casting to a DateTime/Carbon
 * object is deferred to the repository layer when building SQL bindings.
 *
 * Requirements: 2.4 (field definitions), 3.1 (used as the unit of work in SyncBackService)
 */
readonly class CheckinRecordDTO
{
    public function __construct(
        public string $ticket_id,
        public string $checked_in_at,
        public string $checked_in_gate,
        public string $checked_in_by,
        public string $checkin_method,
    ) {}

    /**
     * Construct from a raw array (e.g. from $request->validated('records.*')).
     *
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            ticket_id:       (string) ($data['ticket_id']       ?? ''),
            checked_in_at:   (string) ($data['checked_in_at']   ?? ''),
            checked_in_gate: (string) ($data['checked_in_gate'] ?? ''),
            checked_in_by:   (string) ($data['checked_in_by']   ?? ''),
            checkin_method:  (string) ($data['checkin_method']  ?? ''),
        );
    }

    /**
     * Serialise to array for JSON storage (used in checkin_sync_errors.payload).
     *
     * @return array<string, string>
     */
    public function toArray(): array
    {
        return [
            'ticket_id'       => $this->ticket_id,
            'checked_in_at'   => $this->checked_in_at,
            'checked_in_gate' => $this->checked_in_gate,
            'checked_in_by'   => $this->checked_in_by,
            'checkin_method'  => $this->checkin_method,
        ];
    }
}
