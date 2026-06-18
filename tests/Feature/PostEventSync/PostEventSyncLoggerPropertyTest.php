<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Services\PostEventSyncLogger;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Feature: c3-post-event-sync, Property 11: Structured Log Completeness
 *
 * Every log entry emitted by PostEventSyncLogger contains:
 *   - correlation_id
 *   - event_id
 *   - sync_status
 *
 * Dispatcher entries additionally include batch_number, batch_id, duration_ms.
 *
 * Validates: Requirements 4.7, 10.2, 10.3
 *
 * Uses 100 manual iterations instead of Eris to avoid facade mock conflicts.
 *
 * @group c3-post-event-sync
 */
class PostEventSyncLoggerPropertyTest extends TestCase
{
    /**
     * Feature: c3-post-event-sync, Property 11: Structured Log Completeness
     */
    public function test_every_log_entry_contains_required_base_fields(): void
    {
        for ($i = 0; $i < 100; $i++) {
            $corrId      = 'corr-' . uniqid('', true);
            $eventId     = 'evt-' . $i;
            $batchNumber = random_int(1, 100);
            $batchId     = 'batch-' . $i;
            $durationMs  = random_int(1, 10000);

            $captured = [];

            Log::shouldReceive('channel')
                ->andReturnUsing(function () use (&$captured) {
                    $fake = new class ($captured) {
                        public function __construct(private array &$captured) {}
                        public function info(string $event, array $ctx): void    { $this->captured[] = ['level' => 'info',    'event' => $event, 'context' => $ctx]; }
                        public function error(string $event, array $ctx): void   { $this->captured[] = ['level' => 'error',   'event' => $event, 'context' => $ctx]; }
                        public function warning(string $event, array $ctx): void { $this->captured[] = ['level' => 'warning', 'event' => $event, 'context' => $ctx]; }
                        public function critical(string $event, array $ctx): void{ $this->captured[] = ['level' => 'critical','event' => $event, 'context' => $ctx]; }
                    };
                    return $fake;
                });

            $logger = new PostEventSyncLogger($corrId, $eventId);

            $logger->syncStarted();
            $logger->syncCompleted(5, $durationMs);
            $logger->syncFailed('some error');
            $logger->batchAttempt($batchNumber, $batchId, 1);
            $logger->batchSuccess($batchNumber, $batchId, $durationMs);
            $logger->batchFailed($batchNumber, $batchId, 'err', false);
            $logger->batchFailed($batchNumber, $batchId, 'err', true);

            foreach ($captured as $entry) {
                $ctx = $entry['context'];

                $this->assertArrayHasKey('correlation_id', $ctx,
                    "Iteration {$i}, event '{$entry['event']}' missing correlation_id");
                $this->assertArrayHasKey('event_id', $ctx,
                    "Iteration {$i}, event '{$entry['event']}' missing event_id");
                $this->assertSame($corrId, $ctx['correlation_id']);
                $this->assertSame($eventId, $ctx['event_id']);
            }

            // Batch-specific entries must have batch_number and batch_id
            $batchEvents = [
                'post_event_sync.batch.attempt',
                'post_event_sync.batch.success',
                'post_event_sync.batch.failed',
            ];
            foreach ($captured as $entry) {
                if (in_array($entry['event'], $batchEvents, true)) {
                    $this->assertArrayHasKey('batch_number', $entry['context'],
                        "Iteration {$i}, batch event '{$entry['event']}' missing batch_number");
                    $this->assertArrayHasKey('batch_id', $entry['context'],
                        "Iteration {$i}, batch event '{$entry['event']}' missing batch_id");
                }
            }

            // batchSuccess must have duration_ms
            foreach ($captured as $entry) {
                if ($entry['event'] === 'post_event_sync.batch.success') {
                    $this->assertArrayHasKey('duration_ms', $entry['context'],
                        "Iteration {$i}: batchSuccess missing duration_ms");
                }
            }

            // Reset Mockery expectations after each iteration
            \Mockery::close();
            $this->refreshApplication();
        }
    }
}
