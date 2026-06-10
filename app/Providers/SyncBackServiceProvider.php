<?php

declare(strict_types=1);

namespace App\Providers;

use App\Features\SyncBack\Contracts\SyncErrorRepository;
use App\Features\SyncBack\Contracts\TicketRepository;
use App\Features\SyncBack\Repositories\PostgresSyncErrorRepository;
use App\Features\SyncBack\Repositories\PostgresTicketRepository;
use App\Features\SyncBack\Services\SyncBackService;
use Illuminate\Support\ServiceProvider;

/**
 * Binds all SyncBack interfaces to their concrete PostgreSQL implementations.
 *
 * Follows the same pattern as AttendeeSyncServiceProvider from C1.
 *
 * Requirements: DI constraint, architecture constraint
 */
class SyncBackServiceProvider extends ServiceProvider
{
    /**
     * Register interface → implementation bindings.
     */
    public function register(): void
    {
        $this->app->bind(
            TicketRepository::class,
            PostgresTicketRepository::class
        );

        $this->app->bind(
            SyncErrorRepository::class,
            PostgresSyncErrorRepository::class
        );

        // Bind SyncBackService with the chunk_size resolved from config at container
        // resolution time, so the service itself has no dependency on config().
        $this->app->bind(SyncBackService::class, function ($app): SyncBackService {
            return new SyncBackService(
                ticketRepo:    $app->make(TicketRepository::class),
                syncErrorRepo: $app->make(SyncErrorRepository::class),
                logger:        $app->make(\Psr\Log\LoggerInterface::class),
                chunkSize:     (int) config('syncback.chunk_size', 500),
            );
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void {}
}
