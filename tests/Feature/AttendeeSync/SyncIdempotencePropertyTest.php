<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\DTOs\AttendeeDTO;
use App\Features\AttendeeSync\DTOs\AttendeeUpsertDTO;
use App\Features\AttendeeSync\Services\QrTokenService;
use App\Features\AttendeeSync\Support\BatchPartitioner;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Property 9: Sync is idempotent — running twice produces the same state.
 * Property 10: Re-sync is additive — new rows inserted, existing rows updated, none deleted.
 *
 * Tasks 12.2, 12.3
 *
 * @group c1-attendee-sync
 */
class SyncIdempotencePropertyTest extends TestCase
{
    use TestTrait;

    private QrTokenService $qrTokenService;
    private string $hmacKey;

    protected function setUp(): void
    {
        parent::setUp();
        $this->qrTokenService = new QrTokenService();
        $this->hmacKey        = bin2hex(random_bytes(32));
    }

    /** Build AttendeeUpsertDTO from a ticket_id and event_id */
    private function buildUpsertDto(string $ticketId, int $eventId): AttendeeUpsertDTO
    {
        $dto = new AttendeeDTO(
            ticket_id:     $ticketId,
            event_id:      $eventId,
            attendee_name: "Attendee {$ticketId}",
            ticket_type:   'General',
            company:       null,
            designation:   null,
            seat:          null,
            metadata:      [],
        );
        return AttendeeUpsertDTO::fromAttendeeDTO(
            $dto,
            $this->qrTokenService->sign($ticketId, $this->hmacKey)
        );
    }

    /**
     * Simulate the upsert merge logic in-memory (array keyed by ticket_id).
     * Mirrors the Supabase ON CONFLICT (ticket_id) DO UPDATE SET ... logic.
     * CheckIn fields are preserved if they exist; never overwritten.
     *
     * @param array $store  Current state: ['ticket_id' => [...row data with checkin fields...]]
     * @param array $rows   New upsert rows from toUpsertArray()
     * @return array        Updated store
     */
    private function applyUpsert(array $store, array $rows): array
    {
        foreach ($rows as $row) {
            $key = $row['ticket_id'];
            if (isset($store[$key])) {
                // Update allowed fields, preserve check-in fields
                $existing = $store[$key];
                $store[$key] = array_merge($row, [
                    'checked_in_at'   => $existing['checked_in_at']   ?? null,
                    'checked_in_gate' => $existing['checked_in_gate'] ?? null,
                    'checked_in_by'   => $existing['checked_in_by']   ?? null,
                ]);
            } else {
                $store[$key] = array_merge($row, [
                    'checked_in_at'   => null,
                    'checked_in_gate' => null,
                    'checked_in_by'   => null,
                ]);
            }
        }
        return $store;
    }

    /** Property 9: Running sync twice produces the same state */
    public function test_sync_is_idempotent_running_twice_produces_same_state(): void
    {
        $this
            ->forAll(
                Generator::choose(5, 50) // N attendees
            )
            ->withMaxSize(100)
            ->then(function (int $n) {
                $eventId   = 204;
                $attendees = array_map(
                    fn($i) => $this->buildUpsertDto("T{$i}", $eventId)->toUpsertArray(),
                    range(1, $n)
                );

                // Run once
                $store1 = $this->applyUpsert([], $attendees);
                // Run again (same attendees)
                $store2 = $this->applyUpsert($store1, $attendees);

                $this->assertSame(
                    count($store1),
                    count($store2),
                    'Running sync twice must not add extra rows'
                );

                foreach (array_keys($store1) as $ticketId) {
                    $this->assertArrayHasKey($ticketId, $store2, 'All rows must remain after second run');
                    $this->assertSame(
                        $store1[$ticketId]['qr_token'],
                        $store2[$ticketId]['qr_token'],
                        'QR tokens must be identical across runs'
                    );
                }
            });
    }

    /** Property 10: Re-sync is additive — new rows inserted, existing rows untouched */
    public function test_resync_is_additive_and_preserves_existing_rows(): void
    {
        $this
            ->forAll(
                Generator::choose(5, 30), // M existing attendees
                Generator::choose(1, 10)  // K new attendees
            )
            ->withMaxSize(100)
            ->then(function (int $m, int $k) {
                $eventId  = 204;

                // Initial sync of M attendees
                $initial = array_map(
                    fn($i) => $this->buildUpsertDto("T{$i}", $eventId)->toUpsertArray(),
                    range(1, $m)
                );
                $store = $this->applyUpsert([], $initial);

                // Add check-in data to some existing rows
                foreach (array_keys($store) as $ticketId) {
                    $store[$ticketId]['checked_in_at']   = '2025-01-01T10:00:00Z';
                    $store[$ticketId]['checked_in_gate']  = 'Gate A';
                    $store[$ticketId]['checked_in_by']   = 'staff-001';
                }

                // Re-sync with M + K attendees (K are new)
                $resync = array_map(
                    fn($i) => $this->buildUpsertDto("T{$i}", $eventId)->toUpsertArray(),
                    range(1, $m + $k)
                );
                $store = $this->applyUpsert($store, $resync);

                // Must have at least M + K rows
                $this->assertGreaterThanOrEqual($m + $k, count($store));

                // All original M ticket_ids must still exist
                for ($i = 1; $i <= $m; $i++) {
                    $this->assertArrayHasKey("T{$i}", $store, "Original row T{$i} must still exist");
                }

                // Check-in fields of original rows must be preserved
                for ($i = 1; $i <= $m; $i++) {
                    $this->assertSame(
                        '2025-01-01T10:00:00Z',
                        $store["T{$i}"]['checked_in_at'],
                        "checked_in_at must be preserved for T{$i}"
                    );
                }
            });
    }
}
