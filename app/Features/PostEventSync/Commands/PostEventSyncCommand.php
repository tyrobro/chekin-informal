<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Commands;

use App\Features\PostEventSync\Contracts\EventFinderContract;
use App\Features\PostEventSync\Services\PostEventSyncLogger;
use App\Features\PostEventSync\Services\PostEventSyncOrchestrator;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Artisan command that drives the automatic post-event sync-back pipeline.
 *
 * Registered in bootstrap/app.php to run every 5 minutes via the Laravel
 * scheduler, with withoutOverlapping() to prevent concurrent executions.
 *
 * Behaviour:
 *   1. Generate a UUID correlation_id for this scheduler run
 *   2. Query eligible events (ended, not yet complete/in_progress)
 *   3. For each event: run the full orchestration pipeline
 *   4. Per-event failures are caught and logged — one failure never blocks others
 *   5. Always exits with SUCCESS (0) — failures are logged, not escalated
 *
 * Requirements: 1.1, 1.4, 1.5
 */
class PostEventSyncCommand extends Command
{
    protected $signature   = 'checkin:post-event-sync';
    protected $description = 'Automatically sync checked-in attendees back to ExplaraX for ended events.';

    public function __construct(
        private readonly EventFinderContract       $eventFinder,
        private readonly PostEventSyncOrchestrator $orchestrator,
    ) {
        parent::__construct();
    }

    /**
     * Execute the scheduled sync-back pipeline.
     *
     * Generates one correlation_id per run and passes it through to all
     * services so every log entry for this tick shares the same ID.
     */
    public function handle(): int
    {
        $correlationId = (string) Str::uuid();

        $eventIds = $this->eventFinder->findEligible();

        if (empty($eventIds)) {
            return self::SUCCESS;
        }

        foreach ($eventIds as $eventId) {
            // Create a per-event logger with the shared correlation ID
            $logger = new PostEventSyncLogger($correlationId, $eventId);

            try {
                $this->orchestrator->run($eventId, $correlationId, $logger);
            } catch (\Throwable $e) {
                // Per-event isolation: log failure and continue to next event
                $logger->syncFailed($e->getMessage());
            }
        }

        return self::SUCCESS;
    }
}
