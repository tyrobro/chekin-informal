<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Http\Controllers;

use App\Features\PostEventSync\Http\Requests\RetrySyncRequest;
use App\Features\PostEventSync\Services\RetryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

/**
 * Thin HTTP layer for POST /internal/checkin/retry-sync/{event_id}.
 *
 * Responsibilities:
 *   1. Extract the correlation ID set by VerifySharedSecret middleware.
 *   2. Delegate to RetryService.
 *   3. Return the JSON response.
 *
 * SyncAlreadyCompleteException and SyncAlreadyInProgressException are mapped
 * to HTTP 409 by PostEventSyncServiceProvider::boot() — not caught here.
 *
 * Requirements: 6.4, 6.5
 */
class RetrySyncController extends Controller
{
    public function __construct(
        private readonly RetryService $retryService,
    ) {}

    /**
     * Handle POST /internal/checkin/retry-sync/{event_id}
     *
     * @return JsonResponse 200 { event_id, status, starting_from_batch }
     *                      409 { error } via exception handler
     */
    public function __invoke(RetrySyncRequest $request, string $event_id): JsonResponse
    {
        // request_id set by VerifySharedSecret middleware; fallback for tests
        $correlationId = (string) ($request->attributes->get('request_id') ?? Str::uuid());

        $startingFromBatch = $this->retryService->retry($event_id, $correlationId);

        return response()->json([
            'event_id'            => $event_id,
            'status'              => 'retry_queued',
            'starting_from_batch' => $startingFromBatch,
        ], 200);
    }
}
