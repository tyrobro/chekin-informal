<?php

use App\Features\AttendeeSync\Http\Controllers\PrepareController;
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
| Requirements: 2.1, 2.4, 2.5
|
*/

Route::post(
    '/internal/checkin/prepare/{event_id}',
    PrepareController::class
)->middleware('throttle:10,1');
