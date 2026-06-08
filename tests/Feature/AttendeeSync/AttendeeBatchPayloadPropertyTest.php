<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\DTOs\AttendeeUpsertDTO;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Property 2: Batch payload contains only allowed fields and no PII.
 *
 * @group c1-attendee-sync
 */
class AttendeeBatchPayloadPropertyTest extends TestCase
{
    use TestTrait;

    private const ALLOWED_KEYS = [
        'ticket_id', 'event_id', 'attendee_name', 'ticket_type',
        'company', 'designation', 'seat', 'qr_token', 'metadata',
    ];

    private const PII_KEYS = ['email', 'phone', 'payment_id', 'card_number', 'national_id'];

    public function test_upsert_array_contains_only_allowed_fields_and_no_pii(): void
    {
        $this
            ->forAll(
                Generator::string(),  // ticket_id
                Generator::choose(1, 999999), // event_id
                Generator::string(),  // attendee_name
                Generator::elements('VIP', 'General', 'Speaker', null), // ticket_type
                Generator::string(),  // qr_token (simulated 64-char hex)
            )
            ->withMaxSize(200)
            ->then(function (string $ticketId, int $eventId, string $attendeeName, ?string $ticketType, string $qrToken) {
                $dto = new AttendeeUpsertDTO(
                    ticket_id:     $ticketId,
                    event_id:      $eventId,
                    attendee_name: $attendeeName,
                    ticket_type:   $ticketType,
                    company:       'Acme Corp',
                    designation:   'Engineer',
                    seat:          'A1',
                    qr_token:      str_pad(substr($qrToken, 0, 64), 64, '0'),
                    metadata:      [],
                );

                $array = $dto->toUpsertArray();
                $keys  = array_keys($array);

                // Must contain exactly the 9 allowed keys
                sort($keys);
                $expected = self::ALLOWED_KEYS;
                sort($expected);
                $this->assertSame($expected, $keys, 'Payload must contain exactly the 9 allowed fields');

                // Must not contain any PII key
                foreach (self::PII_KEYS as $piiKey) {
                    $this->assertArrayNotHasKey(
                        $piiKey,
                        $array,
                        "Payload must not contain PII field: {$piiKey}"
                    );
                }

                // Must not contain check-in fields
                $this->assertArrayNotHasKey('checked_in_at', $array);
                $this->assertArrayNotHasKey('checked_in_gate', $array);
                $this->assertArrayNotHasKey('checked_in_by', $array);
            });
    }
}
