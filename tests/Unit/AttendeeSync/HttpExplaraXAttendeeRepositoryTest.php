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
}
