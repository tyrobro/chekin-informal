<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * CheckinSyncController — Slice B1 / C1 integration layer.
 *
 * Provides a synchronous prepare-and-push path that:
 *   1. Builds mock attendee records (matching the Supabase schema).
 *   2. POSTs them to Supabase via Laravel's HTTP facade.
 *   3. Writes progress to Laravel Cache so the status endpoint can respond
 *      immediately without waiting for the full queue pipeline.
 *
 * The queue-based AttendeeSyncJob pipeline remains intact and will supersede
 * this controller when the queue worker is running.
 *
 * Routes (registered in routes/api.php):
 *   POST /internal/checkin/prepare/{event_id}          → prepare()
 *   GET  /internal/checkin/prepare/{event_id}/status   → status()
 */
class CheckinSyncController extends Controller
{
    /** Cache TTL in seconds (1 hour — long enough to survive any reasonable polling window). */
    private const CACHE_TTL = 3600;

    /** Number of mock attendees to generate and push. */
    private const MOCK_COUNT = 5;

    // ── Prepare ──────────────────────────────────────────────────────────────

    /**
     * POST /internal/checkin/prepare/{event_id}
     *
     * 1. Generate MOCK_COUNT mock attendee records.
     * 2. POST them to Supabase event_attendees (upsert, no PII).
     * 3. Store status=completed in Cache so the frontend poll resolves immediately.
     * 4. Return HTTP 202 Accepted.
     */
    public function prepare(Request $request, int|string $event_id): JsonResponse
    {
        $eventId  = (int) $event_id;
        $policy   = $request->input('policy', 'both');
        $cacheKey = "sync_{$eventId}";

        // Mark as processing immediately so any concurrent poll sees a live state.
        Cache::put($cacheKey, [
            'status'    => 'processing',
            'processed' => 0,
            'total'     => self::MOCK_COUNT,
            'failed'    => 0,
        ], self::CACHE_TTL);

        // Build mock attendee records matching AttendeeUpsertDTO::toUpsertArray() shape.
        // No PII — only the 9 whitelisted fields from the C1 spec.
        $attendees = $this->buildMockAttendees($eventId);

        // Push to Supabase.
        $pushed = $this->pushToSupabase($attendees, $eventId, $cacheKey);

        // Write final status to cache.  The frontend polls this every 2 s.
        Cache::put($cacheKey, [
            'status'    => $pushed ? 'completed' : 'failed',
            'processed' => $pushed ? self::MOCK_COUNT : 0,
            'total'     => self::MOCK_COUNT,
            'failed'    => $pushed ? 0 : self::MOCK_COUNT,
        ], self::CACHE_TTL);

        // Also persist to event_preparations table if it exists, best-effort.
        $this->persistPreparation($eventId, $pushed);

        return response()->json([
            'status'    => 'accepted',
            'event_id'  => $eventId,
            'policy'    => $policy,
            'queued_at' => now()->toIso8601String(),
        ], 202);
    }

    // ── Status ───────────────────────────────────────────────────────────────

    /**
     * GET /internal/checkin/prepare/{event_id}/status
     *
     * Returns the current sync progress for the given event.
     * Reads from Cache first; falls back to event_preparations DB table;
     * returns a sensible default if neither has data.
     *
     * Frontend expects: { status, processed, total, failed }
     * Status values the React poller acts on: 'completed' | 'failed'
     * In-flight values: 'processing' | 'pending'
     */
    public function status(int|string $event_id): JsonResponse
    {
        $eventId  = (int) $event_id;
        $cacheKey = "sync_{$eventId}";

        // ── 1. Cache hit ──
        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return response()->json($cached);
        }

        // ── 2. DB fallback (event_preparations table written by AttendeeSyncJob) ──
        try {
            $row = DB::table('event_preparations')
                ->where('event_id', $eventId)
                ->orderByDesc('updated_at')
                ->first(['status', 'attendee_count', 'error_message']);

            if ($row !== null) {
                return response()->json([
                    'status'    => $this->normaliseDbStatus($row->status),
                    'processed' => (int) ($row->attendee_count ?? 0),
                    'total'     => (int) ($row->attendee_count ?? 0),
                    'failed'    => 0,
                ]);
            }
        } catch (\Throwable $e) {
            // DB may not be available in all environments — degrade gracefully.
            Log::warning('CheckinSyncController: DB status lookup failed', [
                'event_id' => $eventId,
                'error'    => $e->getMessage(),
            ]);
        }

        // ── 3. Default — no record found yet ──
        return response()->json([
            'status'    => 'pending',
            'processed' => 0,
            'total'     => 0,
            'failed'    => 0,
        ]);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Build MOCK_COUNT attendee rows using strictly the columns that exist in
     * the Supabase event_attendees table.
     *
     * Allowed top-level keys: ticket_id, event_id, attendee_name, ticket_type,
     * designation, seat, qr_token, metadata.
     *
     * 'company' is NOT a table column — it is stored inside the metadata JSON
     * blob to avoid PGRST204 "column not found" errors.
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildMockAttendees(int $eventId): array
    {
        $ticketTypes = ['General Admission', 'VIP', 'Early Bird', 'Speaker', 'Press'];

        return array_map(function (int $i) use ($eventId, $ticketTypes): array {
            $ticketId = strtoupper(Str::random(6)) . '-' . ($eventId * 100 + $i);

            return [
                'ticket_id'     => $ticketId,
                'event_id'      => $eventId,
                'attendee_name' => 'Mock Attendee ' . $i,
                'ticket_type'   => $ticketTypes[$i % count($ticketTypes)],
                'designation'   => 'Guest',
                'seat'          => 'R' . $i . '-S' . ($i * 3),
                'qr_token'      => hash('sha256', $ticketId . $eventId . Str::random(16)),
                'metadata'      => [
                    'mock'    => true,
                    'index'   => $i,
                    'company' => 'ExplaraX Demo Co.',
                ],
            ];
        }, range(1, self::MOCK_COUNT));
    }

    /**
     * POST the attendee rows to Supabase using the REST upsert endpoint.
     * Attaches the required apikey and Authorization headers as specified.
     *
     * Returns true on success, false on any HTTP / network error.
     */
    private function pushToSupabase(array $attendees, int $eventId, string $cacheKey): bool
    {
        $supabaseUrl = rtrim((string) env('SUPABASE_URL', ''), '/');
        $serviceKey  = (string) env('SUPABASE_SERVICE_ROLE_KEY', '');

        if (empty($supabaseUrl) || empty($serviceKey)) {
            Log::warning('CheckinSyncController: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
            return false;
        }

        try {
            $response = Http::withHeaders([
                'apikey'        => $serviceKey,
                'Authorization' => 'Bearer ' . $serviceKey,
                'Content-Type'  => 'application/json',
                'Prefer'        => 'resolution=merge-duplicates',
            ])
            ->withQueryParameters(['on_conflict' => 'ticket_id'])
            ->post("{$supabaseUrl}/rest/v1/event_attendees", $attendees);

            if ($response->successful()) {
                Log::info('CheckinSyncController: Supabase push succeeded', [
                    'event_id' => $eventId,
                    'count'    => count($attendees),
                    'status'   => $response->status(),
                ]);
                return true;
            }

            Log::error('CheckinSyncController: Supabase push failed', [
                'event_id'    => $eventId,
                'http_status' => $response->status(),
                'body'        => $response->body(),
            ]);
            return false;

        } catch (\Throwable $e) {
            Log::error('CheckinSyncController: Supabase request threw exception', [
                'event_id' => $eventId,
                'error'    => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Best-effort write to event_preparations table.
     * Silently swallowed if the table doesn't exist or the DB is unavailable.
     */
    private function persistPreparation(int $eventId, bool $success): void
    {
        try {
            DB::statement(
                'INSERT INTO event_preparations
                    (event_id, sync_id, status, prepared_at, attendee_count, batch_count, error_message, created_at, updated_at)
                 VALUES (?, ?, ?, NOW(), ?, 1, NULL, NOW(), NOW())
                 ON CONFLICT (event_id) DO UPDATE SET
                    status         = EXCLUDED.status,
                    prepared_at    = EXCLUDED.prepared_at,
                    attendee_count = EXCLUDED.attendee_count,
                    batch_count    = EXCLUDED.batch_count,
                    error_message  = EXCLUDED.error_message,
                    updated_at     = NOW()',
                [
                    $eventId,
                    Str::uuid()->toString(),
                    $success ? 'completed' : 'failed',
                    $success ? self::MOCK_COUNT : 0,
                ]
            );
        } catch (\Throwable) {
            // Intentionally silent — DB persistence is best-effort here.
        }
    }

    /**
     * Map DB status strings to the values the frontend polling logic acts on.
     * Frontend expects: 'completed' | 'failed' | 'processing' | 'pending'
     */
    private function normaliseDbStatus(string $dbStatus): string
    {
        return match ($dbStatus) {
            'completed'   => 'completed',
            'failed'      => 'failed',
            'in_progress' => 'processing',
            default       => 'pending',
        };
    }
}
