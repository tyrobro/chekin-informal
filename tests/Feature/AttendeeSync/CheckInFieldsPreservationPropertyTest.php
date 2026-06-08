<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\DTOs\AttendeeUpsertDTO;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Property 7: CheckIn fields are never included in the upsert payload.
 * Proves that checked_in_at, checked_in_gate, checked_in_by are always preserved on the DB side.
 *
 * @group c1-attendee-sync
 */
class CheckInFieldsPreservationPropertyTest extends TestCase
{
    use TestTrait;

    public function test_upsert_payload_never_contains_checkin_fields(): void
    {
        $this
            ->forAll(
                Generator::string(),          // random checked_in_gate value
                Generator::string(),          // random checked_in_by value
                Generator::string(),          // random ticket_id
                Generator::choose(1, 999999), // random event_id
            )
            ->withMaxSize(200)
            ->then(function (string $gate, string $by, string $ticketId, int $eventId) {
                // Simulate an existing row that has check-in state
                $existingRow = [
                    'ticket_id'      => $ticketId,
                    'event_id'       => $eventId,
                    'checked_in_at'  => '2025-01-01T10:00:00Z',
                    'checked_in_gate' => $gate,
                    'checked_in_by'  => $by,
                ];

                // Build the upsert DTO — it must NOT include check-in fields
                $dto = new AttendeeUpsertDTO(
                    ticket_id:     $existingRow['ticket_id'],
                    event_id:      $existingRow['event_id'],
                    attendee_name: 'Test Attendee',
                    ticket_type:   'General',
                    company:       null,
                    designation:   null,
                    seat:          null,
                    qr_token:      str_repeat('a', 64),
                    metadata:      [],
                );

                $payload = $dto->toUpsertArray();

                $this->assertArrayNotHasKey(
                    'checked_in_at',
                    $payload,
                    'Upsert payload must never contain checked_in_at'
                );
                $this->assertArrayNotHasKey(
                    'checked_in_gate',
                    $payload,
                    'Upsert payload must never contain checked_in_gate'
                );
                $this->assertArrayNotHasKey(
                    'checked_in_by',
                    $payload,
                    'Upsert payload must never contain checked_in_by'
                );
            });
    }
}
