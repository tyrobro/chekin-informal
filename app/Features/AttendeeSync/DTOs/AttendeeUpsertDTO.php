<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\DTOs;

readonly class AttendeeUpsertDTO
{
    public function __construct(
        public string  $ticket_id,
        public int     $event_id,
        public string  $attendee_name,
        public ?string $ticket_type,
        public ?string $company,
        public ?string $designation,
        public ?string $seat,
        public string  $qr_token,       // 64-char hex HMAC-SHA256
        public array   $metadata = [],
    ) {}

    public static function fromAttendeeDTO(AttendeeDTO $dto, string $qrToken): self
    {
        return new self(
            ticket_id:     $dto->ticket_id,
            event_id:      $dto->event_id,
            attendee_name: $dto->attendee_name,
            ticket_type:   $dto->ticket_type,
            company:       $dto->company,
            designation:   $dto->designation,
            seat:          $dto->seat,
            qr_token:      $qrToken,
            metadata:      $dto->metadata,
        );
    }

    /**
     * Returns ONLY the 9 whitelisted fields for the Supabase upsert payload.
     * Never includes email, phone, checked_in_at, checked_in_gate, checked_in_by, or any PII.
     *
     * @return array{
     *   ticket_id: string,
     *   event_id: int,
     *   attendee_name: string,
     *   ticket_type: string|null,
     *   company: string|null,
     *   designation: string|null,
     *   seat: string|null,
     *   qr_token: string,
     *   metadata: array
     * }
     */
    public function toUpsertArray(): array
    {
        return [
            'ticket_id'     => $this->ticket_id,
            'event_id'      => $this->event_id,
            'attendee_name' => $this->attendee_name,
            'ticket_type'   => $this->ticket_type,
            'company'       => $this->company,
            'designation'   => $this->designation,
            'seat'          => $this->seat,
            'qr_token'      => $this->qr_token,
            'metadata'      => $this->metadata,
        ];
    }
}
