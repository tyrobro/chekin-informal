<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\DTOs;

/**
 * Represents a single checked-in attendee record fetched from Supabase.
 *
 * All properties are readonly strings. The checked_in_at value is kept as an
 * ISO 8601 UTC string throughout the pipeline; casting to DateTime/Carbon is
 * deferred to the repository layer when building SQL bindings.
 *
 * Requirements: 2.2
 */
readonly class CheckedInAttendeeDTO
{
    public function __construct(
        public string $ticket_id,
        public string $checked_in_at,
        public string $checked_in_gate,
        public string $checked_in_by,
        public string $checkin_method,
    ) {}

    /**
     * Construct from a raw Supabase REST JSON row.
     * Missing keys fall back to empty string.
     *
     * @param array<string, mixed> $row
     */
    public static function fromSupabaseRow(array $row): self
    {
        return new self(
            ticket_id:       (string) ($row['ticket_id']       ?? ''),
            checked_in_at:   (string) ($row['checked_in_at']   ?? ''),
            checked_in_gate: (string) ($row['checked_in_gate'] ?? ''),
            checked_in_by:   (string) ($row['checked_in_by']   ?? ''),
            checkin_method:  (string) ($row['checkin_method']  ?? ''),
        );
    }

    /**
     * Convert to a C2-contract-compatible array shape.
     *
     * This matches the `records[]` entry shape expected by the
     * POST /internal/checkin/sync-back endpoint (C2 contract).
     *
     * @return array{
     *     ticket_id: string,
     *     checked_in_at: string,
     *     checked_in_gate: string,
     *     checked_in_by: string,
     *     checkin_method: string,
     * }
     */
    public function toCheckinRecord(): array
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
