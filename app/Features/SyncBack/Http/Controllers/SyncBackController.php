<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Http\Controllers;

use App\Features\SyncBack\DTOs\SyncBackRequestDTO;
use App\Features\SyncBack\Http\Requests\SyncBackRequest;
use App\Features\SyncBack\Services\SyncBackService;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

/**
 * Thin HTTP layer for POST /internal/checkin/sync-back.
 *
 * Responsibilities:
 *   1. Extract the correlation ID assigned by VerifySharedSecret middleware.
 *   2. Build the typed SyncBackRequestDTO from the validated request.
 *   3. Delegate to SyncBackService.
 *   4. Return the JSON response.
 *
 * No business logic lives here.
 *
 * Requirements: 6.1 (HTTP 200 response), thin controller constraint
 */
class SyncBackController extends Controller
{
    public function __construct(
        private readonly SyncBackService $syncBackService,
    ) {}

    /**
     * Handle POST /internal/checkin/sync-back
     */
    public function __invoke(SyncBackRequest $request): JsonResponse
    {
        // request_id was set by VerifySharedSecret middleware; fall back to a new
        // UUID if (somehow) it's absent — e.g. in unit tests that bypass middleware.
        $requestId = (string) ($request->attributes->get('request_id') ?? Str::uuid());

        $dto      = SyncBackRequestDTO::fromRequest($request, $requestId);
        $response = $this->syncBackService->process($dto);

        return response()->json($response->toArray(), 200);
    }
}
