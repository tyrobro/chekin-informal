<?php

declare(strict_types=1);

use App\Features\PostEventSync\Http\Controllers\RetrySyncController;
use App\Features\SyncBack\Http\Middleware\VerifySharedSecret;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| C3 Post-Event Sync Routes
|--------------------------------------------------------------------------
|
| Manual retry endpoint for post-event sync-back orchestration.
| Protected by the same shared-secret middleware used by C2 sync-back.
|
| Requirements: 6.1
|
*/

Route::post(
    '/internal/checkin/retry-sync/{event_id}',
    RetrySyncController::class
)->middleware(VerifySharedSecret::class);
