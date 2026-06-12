<?php

use App\Features\AttendeeSync\Http\Controllers\PrepareController;
use App\Features\AttendeeSync\Http\Controllers\SyncStatusController;
use App\Features\SyncBack\Http\Controllers\SyncBackController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Internal Check-In API Routes
|--------------------------------------------------------------------------
|
| POST /internal/checkin/prepare/{event_id}
|   Triggers the attendee sync pipeline for the given event.
|   Acquires a PostgreSQL advisory lock to prevent concurrent syncs.
|   Returns 202 (accepted/queued), 409 (already running), 422 (validation).
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
| GET /internal/checkin/prepare/{event_id}/status
|   Returns the live sync progress for the given event.
|   Reads from the event_preparations table — written by AttendeeSyncJob
|   after each batch so the frontend progress bar advances in real time.
|
|   Response shape:
|     { status: 'pending'|'processing'|'completed'|'failed',
|       processed: <int>, total: <int>, failed: <int> }
|
|   Terminal status values the React poller stops on:
|     'completed' → show success state, update event buttons to Re-sync
|     'failed'    → show error state, show Retry button
|
|   In-flight values (keep polling):
|     'processing' → job is running, progress bar advancing
|     'pending'    → job queued, worker not yet started
|
*/

Route::get(
    '/internal/checkin/prepare/{event_id}/status',
    SyncStatusController::class
)->middleware('throttle:60,1');

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
