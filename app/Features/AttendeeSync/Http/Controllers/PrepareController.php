<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Http\Controllers;

use App\Features\AttendeeSync\Services\AttendeeSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;

/**
 * PrepareController — POST /internal/checkin/prepare/{event_id}
 *
 * Validates the event_id, delegates to AttendeeSyncService, and returns
 * the appropriate HTTP response:
 *   - 202: Sync queued successfully
 *   - 409: Sync already in progress (advisory lock held)
 *   - 422: Invalid event_id
 */
class PrepareController extends Controller
{
    public function __construct(
        private readonly AttendeeSyncService $syncService,
    ) {}

    /**
     * POST /internal/checkin/prepare/{event_id}
     */
    public function __invoke(Request $request, int|string $event_id): JsonResponse
    {
        // ── Validate event_id is a positive integer ──────────────────────────
        $eventId = filter_var($event_id, FILTER_VALIDATE_INT);

        if ($eventId === false || $eventId <= 0) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors'  => [
                    'event_id' => ['The event_id must be a positive integer.'],
                ],
            ], 422);
        }

        // ── Delegate to AttendeeSyncService ──────────────────────────────────
        $result = $this->syncService->prepare($eventId);

        if ($result === null) {
            // Advisory lock is held — sync already in progress
            return response()->json([
                'status'  => 'sync_already_in_progress',
                'message' => 'A sync is already in progress for this event.',
            ], 409);
        }

        Log::info('PrepareController: AttendeeSyncJob dispatched', [
            'event_id' => $eventId,
            'sync_id'  => $result->sync_id,
        ]);

        // ── Return 202 with the response DTO ─────────────────────────────────
        return response()->json($result->toArray(), 202);
    }
}
