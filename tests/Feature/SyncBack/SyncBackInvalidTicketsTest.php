<?php

declare(strict_types=1);

namespace Tests\Feature\SyncBack;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Integration tests for sync-back invalid ticket handling.
 *
 * Records referencing non-existent ticket_ids must:
 * - not abort the batch
 * - be logged to checkin_sync_errors with correct fields
 * - appear in the response failures array
 * - allow valid tickets to be processed regardless
 *
 * Requirements: 5.1–5.4
 * Correctness Property 3: Error Isolation
 * Correctness Property 4: Failure Array Completeness
 *
 * @group c2-sync-back
 */
class SyncBackInvalidTicketsTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET      = 'test-shared-secret-for-phpunit';
    private const ENDPOINT    = '/api/internal/checkin/sync-back';
    private const BATCH_ID    = '550e8400-e29b-41d4-a716-446655440001';
    private const EVENT_ID    = 'TCS-INVALID-2026';
    private const CHECKED_IN_AT = '2026-06-15T10:00:00Z';

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function authHeader(): array
    {
        return ['Authorization' => 'Bearer ' . self::SECRET];
    }

    private function seedTicket(string $ticketId): void
    {
        DB::table('tickets')->insert([
            'ticket_id'  => $ticketId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function makeRecord(string $ticketId): array
    {
        return [
            'ticket_id'       => $ticketId,
            'checked_in_at'   => self::CHECKED_IN_AT,
            'checked_in_gate' => 'Gate A',
            'checked_in_by'   => 'staff-uuid-001',
            'checkin_method'  => 'qr_scan',
        ];
    }

    private function makePayload(array $records): array
    {
        return [
            'event_id' => self::EVENT_ID,
            'batch_id' => self::BATCH_ID,
            'records'  => $records,
        ];
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    public function test_single_invalid_ticket_returns_one_failed(): void
    {
        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload([$this->makeRecord('BAD-001')]),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertSame(0, $response['succeeded']);
        $this->assertSame(1, $response['failed']);
    }

    public function test_invalid_ticket_creates_row_in_checkin_sync_errors(): void
    {
        $this->postJson(
            self::ENDPOINT,
            $this->makePayload([$this->makeRecord('BAD-001')]),
            $this->authHeader()
        )->assertStatus(200);

        $count = DB::table('checkin_sync_errors')
            ->where('ticket_id', 'BAD-001')
            ->count();

        $this->assertSame(1, $count);
    }

    public function test_sync_errors_row_has_correct_fields(): void
    {
        $this->postJson(
            self::ENDPOINT,
            $this->makePayload([$this->makeRecord('BAD-002')]),
            $this->authHeader()
        )->assertStatus(200);

        $row = DB::table('checkin_sync_errors')->where('ticket_id', 'BAD-002')->first();

        $this->assertNotNull($row);
        $this->assertSame(self::EVENT_ID, $row->event_id);
        $this->assertSame('BAD-002', $row->ticket_id);
        $this->assertSame('ticket not found in ExplaraX', $row->reason);
        $this->assertNotEmpty($row->payload);
        $this->assertNotNull($row->created_at);

        // payload must be valid JSON containing the ticket_id
        $decoded = json_decode($row->payload, true);
        $this->assertIsArray($decoded);
        $this->assertSame('BAD-002', $decoded['ticket_id']);
    }

    public function test_50_invalid_out_of_100_returns_50_failed_and_50_succeeded(): void
    {
        // Seed 50 valid tickets
        for ($i = 1; $i <= 50; $i++) {
            $this->seedTicket("VALID-{$i}");
        }

        $records = [];
        for ($i = 1; $i <= 50; $i++) {
            $records[] = $this->makeRecord("VALID-{$i}");
        }
        for ($i = 1; $i <= 50; $i++) {
            $records[] = $this->makeRecord("BAD-{$i}");
        }

        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload($records),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertSame(50, $response['succeeded']);
        $this->assertSame(50, $response['failed']);
        $this->assertCount(50, $response['failures']);
    }

    public function test_invalid_tickets_do_not_stop_valid_tickets_from_processing(): void
    {
        $this->seedTicket('VALID-001');

        $records = [
            $this->makeRecord('BAD-001'),
            $this->makeRecord('VALID-001'),
            $this->makeRecord('BAD-002'),
        ];

        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload($records),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertSame(1, $response['succeeded']);
        $this->assertSame(2, $response['failed']);

        // Valid ticket must actually be updated
        $ticket = DB::table('tickets')->where('ticket_id', 'VALID-001')->first();
        $this->assertNotNull($ticket->checked_in_at);
    }

    public function test_all_invalid_returns_zero_succeeded_and_200_status(): void
    {
        $records = [
            $this->makeRecord('BAD-001'),
            $this->makeRecord('BAD-002'),
            $this->makeRecord('BAD-003'),
        ];

        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload($records),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertSame(0, $response['succeeded']);
        $this->assertSame(3, $response['failed']);
    }

    public function test_failures_array_contains_entry_for_each_invalid_ticket(): void
    {
        $badIds  = ['BAD-001', 'BAD-002', 'BAD-003'];
        $records = array_map(fn (string $id): array => $this->makeRecord($id), $badIds);

        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload($records),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertCount(3, $response['failures']);

        $returnedIds = array_column($response['failures'], 'ticket_id');
        foreach ($badIds as $badId) {
            $this->assertContains($badId, $returnedIds);
        }

        // Each failure entry must have ticket_id and reason
        foreach ($response['failures'] as $failure) {
            $this->assertArrayHasKey('ticket_id', $failure);
            $this->assertArrayHasKey('reason', $failure);
            $this->assertNotEmpty($failure['reason']);
        }
    }

    public function test_failures_reason_is_ticket_not_found(): void
    {
        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload([$this->makeRecord('BAD-001')]),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertSame('ticket not found in ExplaraX', $response['failures'][0]['reason']);
    }
}
