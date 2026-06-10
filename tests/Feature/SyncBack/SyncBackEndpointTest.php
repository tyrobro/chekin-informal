<?php

declare(strict_types=1);

namespace Tests\Feature\SyncBack;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Integration tests for POST /api/internal/checkin/sync-back
 *
 * Covers: authentication, request validation, successful update,
 * response shape, DB state assertions.
 *
 * Requirements: 1.1–1.5, 2.1–2.7, 3.1–3.2, 6.1–6.6
 *
 * @group c2-sync-back
 */
class SyncBackEndpointTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET      = 'test-shared-secret-for-phpunit';
    private const ENDPOINT    = '/api/internal/checkin/sync-back';
    private const BATCH_ID    = '550e8400-e29b-41d4-a716-446655440000';
    private const EVENT_ID    = 'TCS-10K-2026';
    private const CHECKED_IN_AT = '2026-06-15T09:14:23Z';

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function authHeader(string $secret = self::SECRET): array
    {
        return ['Authorization' => "Bearer {$secret}"];
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

    private function basePayload(array $override = []): array
    {
        return array_merge([
            'event_id' => self::EVENT_ID,
            'batch_id' => self::BATCH_ID,
            'records'  => [
                [
                    'ticket_id'       => 'E4CACB-177',
                    'checked_in_at'   => self::CHECKED_IN_AT,
                    'checked_in_gate' => 'Gate A',
                    'checked_in_by'   => 'staff-uuid-001',
                    'checkin_method'  => 'qr_scan',
                ],
            ],
        ], $override);
    }

    // -------------------------------------------------------------------------
    // Authentication tests (Requirement 1)
    // -------------------------------------------------------------------------

    public function test_missing_auth_header_returns_401(): void
    {
        $this->postJson(self::ENDPOINT, $this->basePayload())
            ->assertStatus(401)
            ->assertJson(['error' => 'Unauthorized']);
    }

    public function test_wrong_secret_returns_401(): void
    {
        $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader('wrong-secret'))
            ->assertStatus(401)
            ->assertJson(['error' => 'Unauthorized']);
    }

    public function test_empty_bearer_token_returns_401(): void
    {
        $this->postJson(self::ENDPOINT, $this->basePayload(), ['Authorization' => 'Bearer '])
            ->assertStatus(401)
            ->assertJson(['error' => 'Unauthorized']);
    }

    public function test_malformed_auth_header_returns_401(): void
    {
        $this->postJson(self::ENDPOINT, $this->basePayload(), ['Authorization' => 'Token abc'])
            ->assertStatus(401)
            ->assertJson(['error' => 'Unauthorized']);
    }

    // -------------------------------------------------------------------------
    // Validation tests (Requirement 2)
    // -------------------------------------------------------------------------

    public function test_missing_event_id_returns_422(): void
    {
        $payload = $this->basePayload();
        unset($payload['event_id']);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader())
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['event_id']]);
    }

    public function test_invalid_batch_id_returns_422(): void
    {
        $this->postJson(self::ENDPOINT, $this->basePayload(['batch_id' => 'not-a-uuid']), $this->authHeader())
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['batch_id']]);
    }

    public function test_empty_records_array_returns_422(): void
    {
        $this->postJson(self::ENDPOINT, $this->basePayload(['records' => []]), $this->authHeader())
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['records']]);
    }

    public function test_missing_records_returns_422(): void
    {
        $payload = $this->basePayload();
        unset($payload['records']);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader())
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['records']]);
    }

    public function test_invalid_checkin_method_returns_422(): void
    {
        $payload = $this->basePayload([
            'records' => [[
                'ticket_id'       => 'E4CACB-177',
                'checked_in_at'   => self::CHECKED_IN_AT,
                'checked_in_gate' => 'Gate A',
                'checked_in_by'   => 'staff-uuid-001',
                'checkin_method'  => 'invalid_method',
            ]],
        ]);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader())
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['records.0.checkin_method']]);
    }

    public function test_invalid_checked_in_at_format_returns_422(): void
    {
        $payload = $this->basePayload([
            'records' => [[
                'ticket_id'       => 'E4CACB-177',
                'checked_in_at'   => '2026-06-15 09:14:23', // not ISO 8601 UTC
                'checked_in_gate' => 'Gate A',
                'checked_in_by'   => 'staff-uuid-001',
                'checkin_method'  => 'qr_scan',
            ]],
        ]);

        $this->postJson(self::ENDPOINT, $payload, $this->authHeader())
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['records.0.checked_in_at']]);
    }

    // -------------------------------------------------------------------------
    // Success path (Requirements 3, 6)
    // -------------------------------------------------------------------------

    public function test_valid_request_returns_200(): void
    {
        $this->seedTicket('E4CACB-177');

        $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader())
            ->assertStatus(200);
    }

    public function test_valid_request_response_has_correct_shape(): void
    {
        $this->seedTicket('E4CACB-177');

        $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader())
            ->assertStatus(200)
            ->assertJsonStructure(['batch_id', 'succeeded', 'failed', 'total', 'failures']);
    }

    public function test_batch_id_is_echoed_in_response(): void
    {
        $this->seedTicket('E4CACB-177');

        $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader())
            ->assertStatus(200)
            ->assertJsonFragment(['batch_id' => self::BATCH_ID]);
    }

    public function test_total_equals_records_count(): void
    {
        $this->seedTicket('E4CACB-177');
        $this->seedTicket('E4CACB-178');

        $payload = $this->basePayload([
            'records' => [
                [
                    'ticket_id'       => 'E4CACB-177',
                    'checked_in_at'   => self::CHECKED_IN_AT,
                    'checked_in_gate' => 'Gate A',
                    'checked_in_by'   => 'staff-001',
                    'checkin_method'  => 'qr_scan',
                ],
                [
                    'ticket_id'       => 'E4CACB-178',
                    'checked_in_at'   => self::CHECKED_IN_AT,
                    'checked_in_gate' => 'Gate B',
                    'checked_in_by'   => 'staff-002',
                    'checkin_method'  => 'manual',
                ],
            ],
        ]);

        $response = $this->postJson(self::ENDPOINT, $payload, $this->authHeader())
            ->assertStatus(200)
            ->json();

        $this->assertSame(2, $response['total']);
    }

    public function test_succeeded_plus_failed_equals_total(): void
    {
        $this->seedTicket('E4CACB-177');

        $response = $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader())
            ->assertStatus(200)
            ->json();

        $this->assertSame($response['total'], $response['succeeded'] + $response['failed']);
    }

    public function test_valid_request_updates_ticket_checked_in_at(): void
    {
        $this->seedTicket('E4CACB-177');

        $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader())
            ->assertStatus(200);

        $ticket = DB::table('tickets')->where('ticket_id', 'E4CACB-177')->first();
        $this->assertNotNull($ticket->checked_in_at);
    }

    public function test_valid_request_updates_ticket_checked_in_gate(): void
    {
        $this->seedTicket('E4CACB-177');

        $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader())
            ->assertStatus(200);

        $ticket = DB::table('tickets')->where('ticket_id', 'E4CACB-177')->first();
        $this->assertSame('Gate A', $ticket->checked_in_gate);
    }

    public function test_valid_request_updates_ticket_checkin_method(): void
    {
        $this->seedTicket('E4CACB-177');

        $this->postJson(self::ENDPOINT, $this->basePayload(), $this->authHeader())
            ->assertStatus(200);

        $ticket = DB::table('tickets')->where('ticket_id', 'E4CACB-177')->first();
        $this->assertSame('qr_scan', $ticket->checkin_method);
    }

    public function test_all_three_checkin_methods_accepted_by_endpoint(): void
    {
        foreach (['qr_scan', 'manual', 'nfc'] as $method) {
            $ticketId = "TICKET-{$method}";
            $this->seedTicket($ticketId);

            $payload = $this->basePayload([
                'records' => [[
                    'ticket_id'       => $ticketId,
                    'checked_in_at'   => self::CHECKED_IN_AT,
                    'checked_in_gate' => 'Gate A',
                    'checked_in_by'   => 'staff-001',
                    'checkin_method'  => $method,
                ]],
            ]);

            $this->postJson(self::ENDPOINT, $payload, $this->authHeader())
                ->assertStatus(200)
                ->assertJsonFragment(['succeeded' => 1, 'failed' => 0]);
        }
    }
}
