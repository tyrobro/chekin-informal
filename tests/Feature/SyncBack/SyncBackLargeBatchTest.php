<?php

declare(strict_types=1);

namespace Tests\Feature\SyncBack;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Large-batch integration tests for POST /api/internal/checkin/sync-back.
 *
 * Seeds 10,000 ticket rows and posts a 10,000-record payload. These tests
 * verify both correctness (counts) and throughput (< 120 seconds).
 *
 * Excluded from the default test run — use:
 *   php artisan test --group=slow --filter=SyncBackLargeBatchTest
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 * Correctness Property 1: Response Count Invariant
 *
 * @group slow
 */
class SyncBackLargeBatchTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET   = 'test-shared-secret-for-phpunit';
    private const ENDPOINT = '/api/internal/checkin/sync-back';
    private const BATCH_ID = '550e8400-e29b-41d4-a716-44665544002a';
    private const EVENT_ID = 'TCS-10K-2026';
    private const TOTAL    = 10000;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function authHeader(): array
    {
        return ['Authorization' => 'Bearer ' . self::SECRET];
    }

    /**
     * Seed N ticket rows using chunked bulk inserts for speed.
     */
    private function seedTickets(int $count): void
    {
        $rows  = [];
        $now   = now()->toDateTimeString();

        for ($i = 1; $i <= $count; $i++) {
            $rows[] = [
                'ticket_id'  => "TKT-{$i}",
                'event_id'   => self::EVENT_ID,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            // Bulk insert every 1,000 rows to avoid enormous single INSERT
            if (count($rows) === 1000) {
                DB::table('tickets')->insert($rows);
                $rows = [];
            }
        }

        if ($rows !== []) {
            DB::table('tickets')->insert($rows);
        }
    }

    /**
     * Build the request payload for N records.
     */
    private function makePayload(int $count): array
    {
        $records = [];
        for ($i = 1; $i <= $count; $i++) {
            $records[] = [
                'ticket_id'       => "TKT-{$i}",
                'checked_in_at'   => '2026-06-15T09:14:23Z',
                'checked_in_gate' => 'Gate A',
                'checked_in_by'   => 'staff-uuid-001',
                'checkin_method'  => 'qr_scan',
            ];
        }

        return [
            'event_id' => self::EVENT_ID,
            'batch_id' => self::BATCH_ID,
            'records'  => $records,
        ];
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    /**
     * Requirement 7.1: A batch of 10,000 records must complete within 120 seconds.
     */
    public function test_10000_records_completes_within_120_seconds(): void
    {
        $this->seedTickets(self::TOTAL);

        $start = microtime(true);

        $this->postJson(self::ENDPOINT, $this->makePayload(self::TOTAL), $this->authHeader())
            ->assertStatus(200);

        $elapsed = microtime(true) - $start;

        $this->assertLessThan(
            120,
            $elapsed,
            sprintf('10K sync-back took %.1fs — must complete within 120s', $elapsed)
        );
    }

    /**
     * Correctness Property 1: succeeded + failed = total for a 10K batch.
     */
    public function test_10000_records_correct_counts_in_response(): void
    {
        $this->seedTickets(self::TOTAL);

        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload(self::TOTAL),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertSame(self::TOTAL, $response['total']);
        $this->assertSame(self::TOTAL, $response['succeeded'] + $response['failed']);
        $this->assertSame(self::TOTAL, $response['succeeded'],
            'All 10,000 valid tickets should be in succeeded count'
        );
        $this->assertSame(0, $response['failed']);
        $this->assertSame([], $response['failures']);
    }

    /**
     * Requirement 7.2: A 10K batch with 50 invalid ticket_ids must correctly
     * reflect 9,950 succeeded and 50 failed.
     *
     * C2 spec test scenario: "Sync-back with 50 invalid ticket_ids → 9,950 succeed, 50 logged for review"
     */
    public function test_10000_records_with_50_invalid_returns_correct_split(): void
    {
        // Seed only 9,950 — the remaining 50 will be "not found"
        $this->seedTickets(self::TOTAL - 50);

        $response = $this->postJson(
            self::ENDPOINT,
            $this->makePayload(self::TOTAL),
            $this->authHeader()
        )->assertStatus(200)->json();

        $this->assertSame(self::TOTAL, $response['total']);
        $this->assertSame(9950, $response['succeeded']);
        $this->assertSame(50, $response['failed']);
        $this->assertCount(50, $response['failures']);

        // Verify error rows written to DB
        $errorCount = DB::table('checkin_sync_errors')
            ->where('event_id', self::EVENT_ID)
            ->count();
        $this->assertSame(50, $errorCount);
    }
}
