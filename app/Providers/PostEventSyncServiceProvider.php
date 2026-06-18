<?php

declare(strict_types=1);

namespace App\Providers;

use App\Features\PostEventSync\Commands\PostEventSyncCommand;
use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\Contracts\EventFinderContract;
use App\Features\PostEventSync\Exceptions\SyncAlreadyCompleteException;
use App\Features\PostEventSync\Exceptions\SyncAlreadyInProgressException;
use App\Features\PostEventSync\Repositories\PostgresCheckedInAttendeeRepository;
use App\Features\PostEventSync\Repositories\PostgresCheckpointRepository;
use App\Features\PostEventSync\Services\EventFinderService;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Support\ServiceProvider;

/**
 * Registers all C3 Post-Event Sync bindings, routes, commands, and
 * exception-to-HTTP mappings.
 *
 * Follows the exact pattern of AttendeeSyncServiceProvider.
 *
 * DI bindings:
 *   CheckedInAttendeeRepository → PostgresCheckedInAttendeeRepository
 *   CheckpointRepository        → PostgresCheckpointRepository
 *   EventFinderContract         → EventFinderService
 *
 * Exception mapping (via ExceptionHandler::renderable):
 *   SyncAlreadyCompleteException   → 409 { "error": "sync_already_complete" }
 *   SyncAlreadyInProgressException → 409 { "error": "sync_already_in_progress" }
 *
 * Requirements: all (wiring)
 */
class PostEventSyncServiceProvider extends ServiceProvider
{
    /**
     * Register interface → implementation bindings.
     */
    public function register(): void
    {
        $this->app->bind(
            CheckedInAttendeeRepository::class,
            PostgresCheckedInAttendeeRepository::class
        );

        $this->app->bind(
            CheckpointRepository::class,
            PostgresCheckpointRepository::class
        );

        $this->app->bind(
            EventFinderContract::class,
            EventFinderService::class
        );
    }

    /**
     * Bootstrap routes, commands, and exception handling.
     */
    public function boot(): void
    {
        // Register the manual retry endpoint
        $this->loadRoutesFrom(base_path('routes/post_event_sync.php'));

        // Register the Artisan command (available in console context only)
        if ($this->app->runningInConsole()) {
            $this->commands([
                PostEventSyncCommand::class,
            ]);
        }

        // Map domain exceptions to HTTP 409 responses
        $this->app->make(ExceptionHandler::class)
            ->renderable(function (SyncAlreadyCompleteException $e) {
                return response()->json(['error' => 'sync_already_complete'], 409);
            });

        $this->app->make(ExceptionHandler::class)
            ->renderable(function (SyncAlreadyInProgressException $e) {
                return response()->json(['error' => 'sync_already_in_progress'], 409);
            });
    }
}
