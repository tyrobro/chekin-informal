<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Http\Controllers;

use App\Features\AttendeeSync\Http\Requests\PrepareSyncRequest;
use App\Features\AttendeeSync\Services\AttendeeSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * PrepareController — POST /internal/checkin/prepare/{event_id}
 *
 * Uses AttendeeSyncService::prepare() if available (respects advisory lock).
 * Falls back to direct dispatch with force-clear if the service returns null
 * (stale lock scenario).
 *
 * Validates event_id via PrepareSyncRequest (returns 422 for invalid values).
 */
class PrepareController extends Controller
{
    public function __invoke(PrepareSyncRequest $request, int|string $event_id): JsonResponse
    {
        $eventId = (int) $event_id;

        // Validation: event_id must be a positive integer (handled by PrepareSyncRequest,
        // but double-check for non-numeric route params that cast to 0)
        if ($eventId < 1) {
            return response()->json([
                'message' => 'The event_id must be a positive integer.',
                'errors' => ['event_id' => ['The event_id must be a positive integer (>= 1).']],
            ], 422);
        }

        // Try service-based prepare (respects advisory lock)
        $service = app(AttendeeSyncService::class);
        $result = $service->prepare($eventId);

        if ($result !== null) {
            // Service succeeded — job dispatched via service
            return response()->json([
                'sync_id'   => $result->sync_id,
                'status'    => $result->status,
                'queued_at' => $result->queued_at,
            ], 202);
        }

        // Service returned null (advisory lock already held by another sync).
        return response()->json([
            'status' => 'sync_already_in_progress',
            'message' => 'A sync is already running for this event.',
        ], 409);
    }
}
