<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Http\Controllers;

use App\Features\AttendeeSync\Jobs\AttendeeSyncJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * PrepareController — POST /internal/checkin/prepare/{event_id}
 *
 * Deliberately bypasses the advisory-lock and AttendeeSyncService layers.
 *
 * Why: PostgreSQL advisory locks are session-scoped. When a previous sync job
 * failed (or the worker restarted), the lock stayed held in the same DB session
 * that the queue worker reuses. AttendeeSyncService::prepare() therefore always
 * returned null (→ 409 / silent 200), preventing any new sync from being queued.
 *
 * This controller enforces an unconditional dispatch sequence:
 *   1. Force-clear any stale event_preparations row (removes the in_progress trap).
 *   2. Force-release the advisory lock (removes the session-level lock trap).
 *   3. Dispatch AttendeeSyncJob unconditionally.
 *   4. Return 202 Accepted — always.
 *
 * There is no early-return path that bypasses the dispatch.
 */
class PrepareController extends Controller
{
    /**
     * POST /internal/checkin/prepare/{event_id}
     *
     * @param  Request    $request
     * @param  int|string $event_id  Route parameter (cast to int below)
     * @return JsonResponse          Always 202 on successful queue dispatch
     */
    public function __invoke(Request $request, int|string $event_id): JsonResponse
    {
        $eventId = (int) $event_id;
        $syncId  = Str::uuid()->toString();

        // ── Step 1: Wipe any stale event_preparations row ────────────────────
        // An in_progress or failed row left by a previous crash would make the
        // status endpoint report a stale state while the new job is running.
        // We DELETE rather than UPDATE so the job's own in_progress write
        // (step 1 of AttendeeSyncJob::handle) starts from a clean slate.
        try {
            DB::table('event_preparations')->where('event_id', $eventId)->delete();
        } catch (\Throwable $e) {
            // Non-fatal — log and continue. The job will upsert its own row.
            Log::warning('PrepareController: could not clear event_preparations row', [
                'event_id' => $eventId,
                'error'    => $e->getMessage(),
            ]);
        }

        // ── Step 2: Force-release any held advisory lock ──────────────────────
        // pg_advisory_unlock is a no-op if the lock isn't held, so this is
        // always safe to call. Clears the stale session-level lock that blocks
        // AttendeeSyncService from ever acquiring a fresh one.
        try {
            DB::statement('SELECT pg_advisory_unlock(?)', [$eventId]);
        } catch (\Throwable $e) {
            // Non-fatal — advisory locks are best-effort concurrency hints.
            Log::warning('PrepareController: advisory lock release failed', [
                'event_id' => $eventId,
                'error'    => $e->getMessage(),
            ]);
        }

        // ── Step 3: Dispatch the job unconditionally ──────────────────────────
        // No guard conditions. No early returns. The job always goes to the queue.
        AttendeeSyncJob::dispatch($eventId, $syncId, now()->toIso8601String())
            ->onQueue(env('SYNC_QUEUE', 'default'));

        Log::info('PrepareController: AttendeeSyncJob dispatched', [
            'event_id' => $eventId,
            'sync_id'  => $syncId,
        ]);

        // ── Step 4: Always return 202 ─────────────────────────────────────────
        return response()->json(['message' => 'Sync queued', 'sync_id' => $syncId], 202);
    }
}
