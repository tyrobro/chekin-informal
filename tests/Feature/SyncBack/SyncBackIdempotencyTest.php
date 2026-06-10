<?php

declare(strict_types=1);

namespace Tests\Feature\SyncBack;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Integration tests for sync-back idempotency.
 *
 * Calling the endpoint with the same payload twice must be a no-op:
 * - tickets table rows must be identical after both calls
 * - no new checkin_sync_errors rows must be created by the second call
 * - second call must return HTTP 200 with all records in succeeded count
 *
 * Requirements: 4.1–4.4
 * Correctness Property 2: Idempotency
 * Correctness Property 5: Duplicates Are Counted as Succeeded
 *
 * @group c2-sync-back
 */
class SyncBackIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET      = 'test-shared-secret-for-phpunit';
    private const ENDPOINT    = '/api/internal/checkin/sync-back';
    private const BATCH_ID    = '550e8400-e29b-41d4-a716-446655440000';
    private const EVENT_ID    = 'TCS-IDEM-2026';
    private const CHECKED_IN_AT = '2026-06-15T09:14:23Z';

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function authHeader(): array
    {
        return ['Authorization' => 'Bearer ' . self::SECRET];
    }

    private function seedTicket(string $ticketId, ?string $checkedInAt = null): void
    {
        DB::table('tickets')->insert([
            'ticket_id'    => $ticketId,
            'checked_in_at' => $checkedInAt,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    private function makePayload(array $ticketIds): array
    {
        return [
            'event_id' => self::EVENT_ID,
            'batch_id' => self::BATCH_ID,
            'records'  => array_map(static fn (string $id): array => [
                'ticket_id'       => $id,
                'checked_in_at'   => self::CHECKED_IN_AT,
                'checked_in_gate' => 'Gate A',
                'checked_in_by'   => 'staff-uuid-001',
                'checkin_method'  => 'qr_scan',
            ], $ticketIds),
        ];
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    public function test_second_call_with_same_payload_returns_200(): void
    {
        $this->seedTicket('T1');
        $payload = $this->makePayload(['T1']);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader())->assertStatus(200);
        $this->postJson(self::ENDPOINT, $payload, $this->authHeader())->assertStatus(200);
    }

    public function test_second_call_succeeded_count_equals_total(): void
    {
        $this->seedTicket('T1');
        $payload = $this->makePayload(['T1']);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader());

        $second = $this->postJson(self::ENDPOINT, $payload, $this->authHeader())->json();

        $this->assertSame(1, $second['total']);
        $this->assertSame(1, $second['succeeded']);
        $this->assertSame(0, $second['failed']);
        $this->assertSame([], $second['failures']);
    }

    public function test_second_call_does_not_change_ticket_checked_in_at(): void
    {
        $this->seedTicket('T1');
        $payload = $this->makePayload(['T1']);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader());

        $afterFirst = DB::table('tickets')->where('ticket_id', 'T1')->value('checked_in_at');

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader());

        $afterSecond = DB::table('tickets')->where('ticket_id', 'T1')->value('checked_in_at');

        $this->assertSame($afterFirst, $afterSecond);
    }

    public function test_second_call_does_not_insert_into_checkin_sync_errors(): void
    {
        $this->seedTicket('T1');
        $payload = $this->makePayload(['T1']);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader());
        $countAfterFirst = DB::table('checkin_sync_errors')->where('event_id', self::EVENT_ID)->count();

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader());
        $countAfterSecond = DB::table('checkin_sync_errors')->where('event_id', self::EVENT_ID)->count();

        $this->assertSame($countAfterFirst, $countAfterSecond);
    }

    public function test_all_duplicate_batch_has_zero_failed(): void
    {
        $this->seedTicket('T1');
        $this->seedTicket('T2');
        $this->seedTicket('T3');
        $payload = $this->makePayload(['T1', 'T2', 'T3']);

        // First call — applies the records
        $this->postJson(self::ENDPOINT, $payload, $this->authHeader());

        // Second call — all duplicates
        $response = $this->postJson(self::ENDPOINT, $payload, $this->authHeader())->json();

        $this->assertSame(0, $response['failed']);
        $this->assertSame(3, $response['succeeded']);
        $this->assertSame([], $response['failures']);
    }

    public function test_partial_duplicate_batch_skips_duplicates_updates_new(): void
    {
        // T1 already checked in, T2 is new (not yet checked in)
        $this->seedTicket('T1', self::CHECKED_IN_AT);
        $this->seedTicket('T2');

        $payload = $this->makePayload(['T1', 'T2']);

        $response = $this->postJson(self::ENDPOINT, $payload, $this->authHeader())->json();

        // T1 is a duplicate (same checked_in_at) → succeeded
        // T2 is new → succeeded
        $this->assertSame(2, $response['succeeded']);
        $this->assertSame(0, $response['failed']);

        // T2 must now be updated
        $t2 = DB::table('tickets')->where('ticket_id', 'T2')->first();
        $this->assertNotNull($t2->checked_in_at);
    }
}
