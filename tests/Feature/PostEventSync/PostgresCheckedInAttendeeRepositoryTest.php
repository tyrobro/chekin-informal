<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Exceptions\PostEventSyncException;
use App\Features\PostEventSync\Repositories\PostgresCheckedInAttendeeRepository;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Unit tests for PostgresCheckedInAttendeeRepository (task 7.3)
 *
 * Requirements: 2.1, 2.4
 *
 * @group c3-post-event-sync
 */
class PostgresCheckedInAttendeeRepositoryTest extends TestCase
{
    private PostgresCheckedInAttendeeRepository $repo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repo = new PostgresCheckedInAttendeeRepository();
    }

    private function supabaseEndpoint(): string
    {
        $url = rtrim((string) env('SUPABASE_URL', 'https://test.supabase.co'), '/');
        return "{$url}/rest/v1/event_attendees";
    }

    public function test_returns_empty_array_when_supabase_responds_with_empty_array(): void
    {
        Http::fake([
            '*' => Http::response([], 200),
        ]);

        $result = $this->repo->fetchCheckedIn('EVT-001');

        $this->assertSame([], $result);
    }

    public function test_maps_supabase_rows_to_dtos(): void
    {
        Http::fake([
            '*' => Http::response([
                [
                    'ticket_id'       => 'T-001',
                    'checked_in_at'   => '2026-06-15T09:14:23Z',
                    'checked_in_gate' => 'Gate A',
                    'checked_in_by'   => 'staff-001',
                    'checkin_method'  => 'qr_scan',
                ],
            ], 200),
        ]);

        $result = $this->repo->fetchCheckedIn('EVT-001');

        $this->assertCount(1, $result);
        $this->assertSame('T-001', $result[0]->ticket_id);
        $this->assertSame('2026-06-15T09:14:23Z', $result[0]->checked_in_at);
        $this->assertSame('Gate A', $result[0]->checked_in_gate);
    }

    public function test_supabase_request_includes_correct_query_params(): void
    {
        Http::fake([
            '*' => Http::response([], 200),
        ]);

        $this->repo->fetchCheckedIn('TCS-EVENT-99');

        Http::assertSent(function ($request): bool {
            $url = (string) $request->url();
            return str_contains($url, 'event_id=eq.TCS-EVENT-99')
                && str_contains($url, 'checked_in_at=not.is.null')
                && str_contains($url, 'select=ticket_id');
        });
    }

    public function test_supabase_request_includes_correct_auth_headers(): void
    {
        Http::fake([
            '*' => Http::response([], 200),
        ]);

        $this->repo->fetchCheckedIn('EVT-001');

        Http::assertSent(function ($request): bool {
            $serviceKey = (string) env('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
            return $request->hasHeader('Authorization', "Bearer {$serviceKey}")
                && $request->hasHeader('apikey', $serviceKey);
        });
    }

    public function test_throws_after_all_retries_exhausted_on_500(): void
    {
        Http::fake([
            '*' => Http::response(['error' => 'Internal Server Error'], 500),
        ]);

        $this->expectException(PostEventSyncException::class);

        $this->repo->fetchCheckedIn('EVT-001');
    }

    public function test_retries_on_500_before_throwing(): void
    {
        // With SUPABASE_RETRY_DELAY=0 (from phpunit.xml), 3 retries happen quickly
        $callCount = 0;

        Http::fake([
            '*' => function () use (&$callCount) {
                $callCount++;
                return Http::response([], 500);
            },
        ]);

        try {
            $this->repo->fetchCheckedIn('EVT-001');
        } catch (PostEventSyncException) {
            // expected
        }

        $this->assertSame(3, $callCount, 'Should attempt exactly MAX_RETRIES=3 times');
    }
}
