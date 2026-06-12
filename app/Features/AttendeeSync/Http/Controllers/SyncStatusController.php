<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Http\Controllers;

use App\Features\AttendeeSync\Contracts\EventPreparationRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * SyncStatusController — GET /internal/checkin/prepare/{event_id}/status
 *
 * Reads the current sync state from the event_preparations table and
 * returns a normalised payload that the React frontend polling loop acts on.
 *
 * DB status → frontend status mapping:
 *   in_progress → 'processing'   (keep polling, bar advances)
 *   completed   → 'completed'    (stop polling, show success state)
 *   failed      → 'failed'       (stop polling, show error state + Retry)
 *   (missing)   → 'pending'      (keep polling, job queued but not started yet)
 *
 * Frontend response contract:
 *   {
 *     "status":    "pending" | "processing" | "completed" | "failed",
 *     "processed": <int>,   -- attendees synced so far
 *     "total":     <int>,   -- total attendees for the event (0 while pending)
 *     "failed":    <int>    -- count that could not be synced (0 unless failed)
 *   }
 */
class SyncStatusController extends Controller
{
    public function __construct(
        private readonly EventPreparationRepository $prepRepo,
    ) {}

    /**
     * GET /internal/checkin/prepare/{event_id}/status
     */
    public function __invoke(int $event_id): JsonResponse
    {
        $record = $this->prepRepo->findByEventId($event_id);

        if ($record === null) {
            // Job has been accepted (202) but the worker hasn't started yet.
            return response()->json([
                'status'    => 'pending',
                'processed' => 0,
                'total'     => 0,
                'failed'    => 0,
            ]);
        }

        $frontendStatus = match ($record->status) {
            'completed'   => 'completed',
            'failed'      => 'failed',
            'in_progress' => 'processing',
            default       => 'pending',
        };

        // attendee_count doubles as the processed counter while in_progress
        // (AttendeeSyncJob calls updateProgress() after each batch).
        // On completion it holds the final total.
        $processed = (int) ($record->attendee_count ?? 0);
        $total     = (int) ($record->attendee_count ?? 0);

        // On a failed sync we surface how many were not synced.
        // We don't store a separate failed_count column, so we report 0 and
        // let the frontend fall back to total − processed from its own state.
        $failedCount = $record->status === 'failed' ? 0 : 0;

        return response()->json([
            'status'    => $frontendStatus,
            'processed' => $processed,
            'total'     => $total,
            'failed'    => $failedCount,
            // Optional extra detail the frontend can ignore.
            'message'   => $record->error_message,
        ]);
    }
}
