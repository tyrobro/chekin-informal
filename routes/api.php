<?php

use App\Features\AttendeeSync\Http\Controllers\PrepareController;
use App\Features\SyncBack\Http\Controllers\SyncBackController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Internal Check-In API Routes
|--------------------------------------------------------------------------
|
| POST /internal/checkin/prepare/{event_id}
|   Triggers the attendee sync pipeline for the given event.
|   Rate limited to 10 requests per minute per IP.
|   Returns 202 (queued), 409 (already running), or 422 (validation error).
|
| Requirements C1: 2.1, 2.4, 2.5
|
*/

Route::post(
    '/internal/checkin/prepare/{event_id}',
    PrepareController::class
)->middleware('throttle:10,1');

/*
|--------------------------------------------------------------------------
|
| POST /internal/checkin/sync-back
|   Receives check-in records from Supabase and writes them back to the
|   tickets table. Protected by shared-secret Bearer token authentication.
|   Returns 200 with batch counts, 401 for auth failures, 422 for bad input.
|
| Requirements C2: 1.1–1.5, 2.1–2.7, 6.1–6.6
|
*/

Route::middleware(['verify.shared.secret'])
    ->prefix('internal/checkin')
    ->group(function (): void {
        Route::post('sync-back', SyncBackController::class)
            ->name('checkin.sync-back');
    });
