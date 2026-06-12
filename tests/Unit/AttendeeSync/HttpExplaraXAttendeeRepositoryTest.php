<?php

declare(strict_types=1);

namespace Tests\Unit\AttendeeSync;

use App\Features\AttendeeSync\DTOs\AttendeeDTO;
use App\Features\AttendeeSync\Exceptions\ExplaraXApiException;
use App\Features\AttendeeSync\Repositories\HttpExplaraXAttendeeRepository;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * @group c1-attendee-sync
 */
class HttpExplaraXAttendeeRepositoryTest extends TestCase
{
    private HttpExplaraXAttendeeRepository $repo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repo = new HttpExplaraXAttendeeRepository();
        // EXPLARA_PAYMENTS_URL and EXPLARA_API_TOKEN are set via phpunit.xml
    }

    private function makeAttendee(string $ticketId, array $extra = []): array
    {
        return array_merge([
            'ticket_id'     => $ticketId,
            'attendee_name' => 'Test User',
            'ticket_type'   => 'General',
            'company'       => 'Acme',
            'designation'   => 'Engineer',
            'seat'          => 'A1',
            'metadata'      => [],
        ], $extra);
    }

    /** Task 6.3 — Test 1: Single-page response */
    public function test_fetches_all_attendees_from_single_page(): void
    {
        Http::fake([
            'https://payments.explarax.com/api/event/204/attendees*' => Http::response([
                $this->makeAttendee('T1'),
                $this->makeAttendee('T2'),
                $this->makeAttendee('T3'),
            ], 200),
        ]);

        $result = $this->repo->fetchAllForEvent(204);

        $this->assertCount(3, $result);
        $this->assertContainsOnlyInstancesOf(AttendeeDTO::class, $result);
        $this->assertSame('T1', $result[0]->ticket_id);
        $this->assertSame('T3', $result[2]->ticket_id);
    }

    /** Task 6.3 — Test 2: Paginated two-page response */
    public function test_fetches_all_pages_when_paginated(): void
    {
        Http::fake([
            'https://payments.explarax.com/api/event/204/attendees' => Http::response([
                'data'          => [$this->makeAttendee('T1'), $this->makeAttendee('T2')],
                'next_page_url' => 'https://payments.explarax.com/api/event/204/attendees?page=2',
            ], 200),
            'https://payments.explarax.com/api/event/204/attendees?page=2' => Http::response([
                'data'          => [$this->makeAttendee('T3'), $this->makeAttendee('T4')],
                'next_page_url' => null,
            ], 200),
        ]);

        $result = $this->repo->fetchAllForEvent(204);

        $this->assertCount(4, $result);
        $ticketIds = array_map(fn(AttendeeDTO $d) => $d->ticket_id, $result);
        $this->assertSame(['T1', 'T2', 'T3', 'T4'], $ticketIds);
    }

    /** Task 6.3 — Test 3: Non-2xx response throws ExplaraXApiException */
    public function test_throws_on_non_2xx_response(): void
    {
        Http::fake([
            'https://payments.explarax.com/api/event/204/attendees*' => Http::response('Internal Server Error', 500),
        ]);

        $this->expectException(ExplaraXApiException::class);

        $this->repo->fetchAllForEvent(204);
    }

    /** Task 6.3 — Test 4: PII fields are never present in returned DTOs */
    public function test_pii_fields_are_stripped_from_dtos(): void
    {
        Http::fake([
            'https://payments.explarax.com/api/event/204/attendees*' => Http::response([
                $this->makeAttendee('T1', [
                    'email'      => 'user@example.com',
                    'phone'      => '+919876543210',
                    'payment_id' => 'pay_abc123',
                ]),
            ], 200),
        ]);

        $result = $this->repo->fetchAllForEvent(204);

        $this->assertCount(1, $result);
        $dto = $result[0];

        // AttendeeDTO is a typed readonly class — these properties should not exist
        $this->assertObjectNotHasProperty('email', $dto);
        $this->assertObjectNotHasProperty('phone', $dto);
        $this->assertObjectNotHasProperty('payment_id', $dto);
    }

    // -------------------------------------------------------------------------
    // Regression tests — attendee_name field mapping (bugfix)
    // Bug:   fromApiResponse() read $data['attendee_name'] (flat key, always null in
    //        the real ExplaraX API). Real API delivers name as $data['account']['name'].
    // Fix:   attendee_name resolves $account['name'] ?? $data['attendee_name'] ?? ''.
    // Scope: Only attendee_name is proven to live under 'account'. The four other
    //        identity fields (ticket_type, company, designation, seat) remain flat reads
    //        until API evidence confirms their nested path.
    // -------------------------------------------------------------------------

    /**
     * Regression — nested account shape (real ExplaraX API payload).
     *
     * Reproduces the confirmed Tinker evidence:
     *   GET /api/event/204/attendees → { "ticket_id": 86, "account": { "name": "Pankaj Kumar" } }
     *   Previously produced: AttendeeDTO { attendee_name: "" }
     *   Now must produce:    AttendeeDTO { attendee_name: "Pankaj Kumar" }
     */
    public function test_maps_attendee_name_from_nested_account_shape(): void
    {
        // Minimal real-API payload (ticket_id=86, confirmed via Tinker)
        $dto = AttendeeDTO::fromApiResponse(204, [
            'ticket_id' => 86,
            'account'   => ['name' => 'Pankaj Kumar'],
        ]);

        $this->assertSame('86',           $dto->ticket_id);
        $this->assertSame(204,            $dto->event_id);
        $this->assertSame('Pankaj Kumar', $dto->attendee_name);

        // Other identity fields are absent from the payload — they should be null/empty,
        // not fabricated from the account object.
        $this->assertNull($dto->ticket_type);
        $this->assertNull($dto->company);
        $this->assertNull($dto->designation);
        $this->assertNull($dto->seat);
    }

    /**
     * Regression — flat payload shape (legacy / existing tests must be unaffected).
     *
     * All existing tests use makeAttendee() which produces flat keys at the top level.
     * This test explicitly verifies that the fix did not break flat-shape resolution.
     */
    public function test_maps_all_fields_from_flat_payload_shape(): void
    {
        $dto = AttendeeDTO::fromApiResponse(204, [
            'ticket_id'     => 'T-FLAT-1',
            'attendee_name' => 'Flat User',
            'ticket_type'   => 'General',
            'company'       => 'Acme',
            'designation'   => 'Engineer',
            'seat'          => 'A1',
            'metadata'      => ['badge' => 'blue'],
        ]);

        $this->assertSame('T-FLAT-1',  $dto->ticket_id);
        $this->assertSame(204,         $dto->event_id);
        $this->assertSame('Flat User', $dto->attendee_name);
        $this->assertSame('General',   $dto->ticket_type);
        $this->assertSame('Acme',      $dto->company);
        $this->assertSame('Engineer',  $dto->designation);
        $this->assertSame('A1',        $dto->seat);
        $this->assertSame(['badge' => 'blue'], $dto->metadata);
    }

    /**
     * Regression — nested account shape delivered via the HTTP repository.
     *
     * Verifies that HttpExplaraXAttendeeRepository correctly maps a real-API-shaped
     * HTTP response. Only attendee_name is asserted from account; other fields are
     * absent in this payload and expected to be null.
     */
    public function test_fetches_attendees_with_nested_account_shape(): void
    {
        Http::fake([
            'https://payments.explarax.com/api/event/204/attendees*' => Http::response([
                ['ticket_id' => 86, 'account' => ['name' => 'Pankaj Kumar']],
                ['ticket_id' => 87, 'account' => ['name' => 'Jane Doe']],
            ], 200),
        ]);

        $result = $this->repo->fetchAllForEvent(204);

        $this->assertCount(2, $result);
        $this->assertSame('86',           $result[0]->ticket_id);
        $this->assertSame('Pankaj Kumar', $result[0]->attendee_name);
        $this->assertSame('87',           $result[1]->ticket_id);
        $this->assertSame('Jane Doe',     $result[1]->attendee_name);
    }

    /**
     * Regression — PII is stripped even when payload uses nested account shape.
     */
    public function test_pii_fields_are_stripped_from_nested_shape_dtos(): void
    {
        Http::fake([
            'https://payments.explarax.com/api/event/204/attendees*' => Http::response([
                [
                    'ticket_id'  => 99,
                    'account'    => ['name' => 'PII Test User'],
                    'email'      => 'also@excluded.com',
                    'payment_id' => 'pay_xyz',
                ],
            ], 200),
        ]);

        $result = $this->repo->fetchAllForEvent(204);

        $this->assertCount(1, $result);
        $dto = $result[0];

        $this->assertSame('PII Test User', $dto->attendee_name);
        $this->assertObjectNotHasProperty('email',      $dto);
        $this->assertObjectNotHasProperty('phone',      $dto);
        $this->assertObjectNotHasProperty('payment_id', $dto);
    }
}
