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
     * Create from a raw Explara API response record.
     *
     * Explara's attendee endpoint does NOT use snake_case 'ticket_id'.
     * The actual unique identifier field is tried in priority order:
     *
     *   1. ticketNo     — Explara's primary ticket identifier (most common)
     *   2. ticket_no    — snake_case variant
     *   3. ticket_id    — our internal convention (may not exist in source)
     *   4. id           — generic row identifier (last resort)
     *
     * Similarly, attendee_name is resolved from:
     *   attendeeName → attendee_name → name → fullName → full_name
     *
     * If no unique identifier resolves to a non-empty value, a RuntimeException
     * is thrown immediately. This surfaces as a failed job with a log entry
     * containing the raw payload, making it straightforward to add the correct
     * field name once the response is inspected.
     *
     * PII fields (email, phone, payment_*) are never mapped.
     *
     * @throws \RuntimeException if no unique ticket identifier is found
     */
    public static function fromApiResponse(int $eventId, array $data): self
    {
        // ── Unique identifier — try all known Explara field name variants ──
        $ticketId = (string) (
            $data['ticketNo']   ??
            $data['ticket_no']  ??
            $data['ticket_id']  ??
            $data['ticketId']   ??
            $data['id']         ??
            ''
        );

        if ($ticketId === '') {
            throw new \RuntimeException(
                'AttendeeDTO mapping failed: could not locate a unique ticket identifier. ' .
                'Tried: ticketNo, ticket_no, ticket_id, ticketId, id. ' .
                'Raw payload: ' . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
        }

        // ── Attendee name — try all known Explara field name variants ──
        // Note: In the RSVP/ticket API response, the attendee name is often
        // nested inside an 'account' object as account.name or account.first_name + account.last_name.
        $attendeeName = (string) (
            $data['attendeeName']  ??
            $data['attendee_name'] ??
            $data['name']          ??
            $data['fullName']      ??
            $data['full_name']     ??
            ''
        );

        // Fallback: extract from nested account object (ExplaraX RSVP format)
        if ($attendeeName === '' && isset($data['account'])) {
            $account = $data['account'];
            // account may be a JSON string or an associative array
            if (is_string($account)) {
                $decoded = json_decode($account, true);
                if (is_array($decoded)) $account = $decoded;
            }
            if (is_array($account)) {
                $attendeeName = (string) ($account['name'] ?? '');
                if ($attendeeName === '' && (isset($account['first_name']) || isset($account['last_name']))) {
                    $attendeeName = trim(($account['first_name'] ?? '') . ' ' . ($account['last_name'] ?? ''));
                }
            }
        }

        // ── Ticket type — try camelCase and snake_case variants ──
        $ticketType = $data['ticketType']  ??
                      $data['ticket_type'] ??
                      $data['type']        ??
                      null;

        return new self(
            ticket_id:     $ticketId,
            event_id:      $eventId,
            attendee_name: $attendeeName,
            ticket_type:   isset($ticketType) ? (string) $ticketType : null,
            company:       isset($data['company'])     ? (string) $data['company']     : null,
            designation:   isset($data['designation']) ? (string) $data['designation'] : null,
            seat:          isset($data['seat'])        ? (string) $data['seat']        : null,
            // Preserve the complete raw record in metadata (minus PII).
            // This ensures no data is lost and makes field discovery easy.
            metadata: array_diff_key($data, array_flip([
                // Strip PII — never persist these
                'email', 'phone', 'mobile', 'payment_id', 'payment_amount',
                'payment_status', 'payment_method', 'address',
            ])),
        );
    }
}
