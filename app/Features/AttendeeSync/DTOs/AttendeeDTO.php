<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\DTOs;

readonly class AttendeeDTO
{
    public function __construct(
        public string  $ticket_id,
        public int     $event_id,
        public string  $attendee_name,
        public ?string $ticket_type,
        public ?string $company,
        public ?string $designation,
        public ?string $seat,
        public array   $metadata = [],
    ) {}

    /**
     * Create from a raw API response array, explicitly picking only allowed fields.
     * PII fields (email, phone, payment_*) are never mapped.
     */
    public static function fromApiResponse(int $eventId, array $data): self
    {
        return new self(
            ticket_id:     (string) ($data['ticket_id'] ?? ''),
            event_id:      $eventId,
            attendee_name: (string) ($data['attendee_name'] ?? ''),
            ticket_type:   isset($data['ticket_type']) ? (string) $data['ticket_type'] : null,
            company:       isset($data['company'])     ? (string) $data['company']     : null,
            designation:   isset($data['designation']) ? (string) $data['designation'] : null,
            seat:          isset($data['seat'])        ? (string) $data['seat']        : null,
            metadata:      isset($data['metadata']) && is_array($data['metadata']) ? $data['metadata'] : [],
        );
    }
}
