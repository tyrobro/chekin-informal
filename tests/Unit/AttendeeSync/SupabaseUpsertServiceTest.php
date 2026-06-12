<?php

declare(strict_types=1);

namespace Tests\Unit\AttendeeSync;

use App\Features\AttendeeSync\Exceptions\SupabaseBatchException;
use App\Features\AttendeeSync\Services\SupabaseUpsertService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * @group c1-attendee-sync
 */
class SupabaseUpsertServiceTest extends TestCase
{
    private SupabaseUpsertService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new SupabaseUpsertService();
        // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set via phpunit.xml
    }

    /** Task 7.2 — Test 1: Succeeds on third attempt (fail, fail, success) */
    public function test_upserts_successfully_after_two_failures(): void
    {
        Http::fake([
            'https://test.supabase.co/rest/v1/event_attendees*' => Http::sequence()
                ->push('Server Error', 500)
                ->push('Server Error', 500)
                ->push('', 201),
        ]);

        // Should not throw
        $this->service->upsertBatch(1, [['ticket_id' => 'T1', 'event_id' => 1]]);

        Http::assertSentCount(3);
    }

    /** Task 7.2 — Test 2: Throws SupabaseBatchException after 3 failures */
    public function test_throws_exception_after_exhausting_retries(): void
    {
        Http::fake([
            'https://test.supabase.co/rest/v1/event_attendees*' => Http::sequence()
                ->push('Server Error', 500)
                ->push('Server Error', 500)
                ->push('Server Error', 500),
        ]);

        $this->expectException(SupabaseBatchException::class);

        $this->service->upsertBatch(1, [['ticket_id' => 'T1', 'event_id' => 1]]);
    }

    /** Task 7.2 — Test 3: Succeeds on first attempt (single HTTP call) */
    public function test_succeeds_on_first_attempt(): void
    {
        Http::fake([
            'https://test.supabase.co/rest/v1/event_attendees*' => Http::response('', 201),
        ]);

        $this->service->upsertBatch(1, [['ticket_id' => 'T1', 'event_id' => 1]]);

        Http::assertSentCount(1);
    }

    /** Verify the correct headers are sent */
    public function test_sends_correct_headers(): void
    {
        Http::fake([
            'https://test.supabase.co/rest/v1/event_attendees*' => Http::response('', 201),
        ]);

        $this->service->upsertBatch(1, []);

        Http::assertSent(function (\Illuminate\Http\Client\Request $request) {
            return str_contains($request->url(), 'on_conflict=ticket_id')
                && str_contains($request->header('Prefer')[0] ?? '', 'merge-duplicates')
                && str_contains($request->header('Authorization')[0] ?? '', 'Bearer');
        });
    }
}
