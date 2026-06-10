<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Http\Controllers;

use App\Features\AttendeeSync\Http\Requests\PrepareSyncRequest;
use App\Features\AttendeeSync\Services\AttendeeSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * Thin HTTP layer — delegates all business logic to AttendeeSyncService.
 *
 * Requirements: 2.1, 2.6, 3.2
 */
class PrepareController extends Controller
{
    public function __construct(
        private readonly AttendeeSyncService $syncService,
    ) {}

    /**
     * POST /internal/checkin/prepare/{event_id}
     *
     * Returns 202 with sync_id and status=queued on success.
     * Returns 409 if a sync for this event is already in progress.
     */
    public function __invoke(PrepareSyncRequest $request, int $event_id): JsonResponse
    {
        $dto = $this->syncService->prepare($event_id);

        if ($dto === null) {
            // Advisory lock was already held — another sync is running
            return response()->json(
                ['status' => 'sync_already_in_progress', 'message' => 'A sync is already running for this event.'],
                409
            );
        }

        return response()->json($dto->toArray(), 202);
    }
}
