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
        public ?string $designation,
        public ?string $seat,
        public string  $qr_token,       // 64-char hex HMAC-SHA256
        public ?string $event_name = null,
        public array   $metadata = [],
    ) {}

    /**
     * Build from an AttendeeDTO and a pre-computed QR token.
     *
     * 'company' is intentionally excluded from the top-level payload because
     * the Supabase event_attendees table does not have a company column.
     * If company data exists on the source DTO it is folded into the metadata
     * blob where it is stored as unstructured JSON without breaking the schema.
     *
     * @throws \RuntimeException if the resolved ticket_id is empty
     */
    public static function fromAttendeeDTO(AttendeeDTO $dto, string $qrToken, ?string $eventName = null): self
    {
        // AttendeeDTO::fromApiResponse() already throws if ticket_id is empty,
        // but we add a second guard here because AttendeeDTO can also be
        // constructed directly (e.g. in tests) with an empty ticket_id.
        if ($dto->ticket_id === '') {
            throw new \RuntimeException(
                'AttendeeUpsertDTO: received an AttendeeDTO with an empty ticket_id. ' .
                'event_id=' . $dto->event_id . ' attendee_name=' . $dto->attendee_name
            );
        }

        // Merge company into metadata so no top-level column mismatch occurs.
        $metadata = $dto->metadata;
        if ($dto->company !== null && $dto->company !== '') {
            $metadata['company'] = $dto->company;
        }

        return new self(
            ticket_id:     $dto->ticket_id,
            event_id:      $dto->event_id,
            attendee_name: $dto->attendee_name,
            ticket_type:   $dto->ticket_type,
            designation:   $dto->designation,
            seat:          $dto->seat,
            qr_token:      $qrToken,
            event_name:    $eventName,
            metadata:      $metadata,
        );
    }

    /**
     * Returns ONLY the columns that exist in the Supabase event_attendees table.
     *
     * Strictly excluded from the top-level payload:
     *   - company        (not a column — stored in metadata)
     *   - email          (PII — never synced)
     *   - phone          (PII — never synced)
     *   - checked_in_at  (written by gate app, never overwritten here)
     *   - checked_in_gate / checked_in_by / checkin_method  (same)
     *
     * @return array{
     *   ticket_id: string,
     *   event_id: int,
     *   attendee_name: string,
     *   ticket_type: string|null,
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
            'designation'   => $this->designation,
            'seat'          => $this->seat,
            'qr_token'      => $this->qr_token,
            'event_name'    => $this->event_name,
            'metadata'      => $this->metadata,
        ];
    }
}
