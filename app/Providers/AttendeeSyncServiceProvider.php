<?php

declare(strict_types=1);

namespace App\Providers;

use App\Features\AttendeeSync\Contracts\EventPreparationRepository;
use App\Features\AttendeeSync\Contracts\ExplaraXAttendeeRepository;
use App\Features\AttendeeSync\Contracts\HmacKeyRepository;
use App\Features\AttendeeSync\Repositories\HttpExplaraXAttendeeRepository;
use App\Features\AttendeeSync\Repositories\PostgresEventPreparationRepository;
use App\Features\AttendeeSync\Repositories\PostgresHmacKeyRepository;
use Illuminate\Support\ServiceProvider;

/**
 * Binds all AttendeeSync interfaces to their concrete implementations.
 *
 * Requirements: all (interface → implementation wiring)
 */
class AttendeeSyncServiceProvider extends ServiceProvider
{
    /**
     * Register interface → implementation bindings.
     */
    public function register(): void
    {
        $this->app->bind(
            ExplaraXAttendeeRepository::class,
            HttpExplaraXAttendeeRepository::class
        );

        $this->app->bind(
            HmacKeyRepository::class,
            PostgresHmacKeyRepository::class
        );

        $this->app->bind(
            EventPreparationRepository::class,
            PostgresEventPreparationRepository::class
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Load the API routes
        $this->loadRoutesFrom(base_path('routes/api.php'));
    }
}
