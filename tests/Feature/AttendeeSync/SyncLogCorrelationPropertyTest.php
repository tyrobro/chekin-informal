<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\Services\SyncLogger;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Property 11: Every log entry emitted by SyncLogger contains sync_id and event_id.
 *
 * Runs 100 distinct (sync_id, event_id) pairs through all 5 log methods.
 * Each call is verified to contain the correct correlation IDs.
 *
 * @group c1-attendee-sync
 */
class SyncLogCorrelationPropertyTest extends TestCase
{
    /**
     * Run the assertion for 100 different (sync_id, event_id) pairs.
     */
    public function test_every_log_entry_always_contains_sync_id_and_event_id(): void
    {
        $totalVerified = 0;

        for ($i = 0; $i < 100; $i++) {
            $syncId  = Str::uuid()->toString();
            $eventId = random_int(1, 999999);
            $logger  = new SyncLogger($syncId, $eventId);

            // Capture all context arrays passed to Log::channel()->info()
            $capturedContexts = [];

            Log::shouldReceive('channel')
                ->with('json_daily')
                ->andReturnUsing(function () use (&$capturedContexts, $syncId, $eventId) {
                    $mock = \Mockery::mock();
                    $mock->shouldReceive('info')
                        ->andReturnUsing(function (string $msg, array $ctx) use (&$capturedContexts) {
                            $capturedContexts[] = $ctx;
                        });
                    return $mock;
                });

            // Exercise all 5 log methods
            $logger->started(now()->toIso8601String());
            $logger->batchCompleted(1, 10, 500);
            $logger->batchRetry(1, 1, 'timeout');
            $logger->completed(10, 1, 3000);
            $logger->failed(1, 'network error');

            $this->assertCount(5, $capturedContexts,
                "Iteration {$i}: all 5 log methods must emit exactly one entry each"
            );

            foreach ($capturedContexts as $ctx) {
                $this->assertArrayHasKey('sync_id', $ctx,
                    "Iteration {$i}: every log entry must contain sync_id"
                );
                $this->assertArrayHasKey('event_id', $ctx,
                    "Iteration {$i}: every log entry must contain event_id"
                );
                $this->assertSame($syncId, $ctx['sync_id'],
                    "Iteration {$i}: sync_id in log context must match logger's sync_id"
                );
                $this->assertSame($eventId, $ctx['event_id'],
                    "Iteration {$i}: event_id in log context must match logger's event_id"
                );
            }

            $totalVerified += count($capturedContexts);

            // Reset Mockery state between iterations
            \Mockery::close();
            // Re-register the Log facade mock for the next iteration
            $this->app->forgetInstance('log');
        }

        // 100 iterations × 5 log calls = 500 verified
        $this->assertSame(500, $totalVerified,
            'Must verify exactly 500 log correlation entries (100 iterations × 5 methods)'
        );
    }
}
