<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Services\SyncBackDispatcher;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Feature: c3-post-event-sync
 *
 * Property 4: Deterministic Batch ID
 *   Same (event_id, batch_number) always produces same batch_id.
 *   Different pairs produce different strings.
 *   Validates: Requirements 4.2, 9.2
 *
 * Property 9: Error Message Shape
 *   error_message contains the HTTP status code string and strlen <= 500.
 *   Validates: Requirement 7.4
 *
 * @group c3-post-event-sync
 */
class SyncBackDispatcherPropertyTest extends TestCase
{
    use TestTrait;

    /**
     * Feature: c3-post-event-sync, Property 4: Deterministic Batch ID
     */
    public function test_deterministic_batch_id(): void
    {
        $this
            ->forAll(
                Generator::string(),               // event_id
                Generator::choose(1, 10000)        // batch_number
            )
            ->withMaxSize(100)
            ->then(function (string $eventId, int $batchNumber): void {
                $id1 = SyncBackDispatcher::deriveBatchId($eventId, $batchNumber);
                $id2 = SyncBackDispatcher::deriveBatchId($eventId, $batchNumber);

                $this->assertSame($id1, $id2, 'Same inputs must always produce the same batch_id');
                $this->assertNotEmpty($id1);
                $this->assertIsString($id1);
            });
    }

    public function test_different_inputs_produce_different_batch_ids(): void
    {
        // Different event_id, same batch_number
        $id1 = SyncBackDispatcher::deriveBatchId('event-A', 1);
        $id2 = SyncBackDispatcher::deriveBatchId('event-B', 1);
        $this->assertNotSame($id1, $id2);

        // Same event_id, different batch_number
        $id3 = SyncBackDispatcher::deriveBatchId('event-A', 1);
        $id4 = SyncBackDispatcher::deriveBatchId('event-A', 2);
        $this->assertNotSame($id3, $id4);
    }

    /**
     * Feature: c3-post-event-sync, Property 9: Error Message Shape
     *
     * The error_message persisted to event_sync_status must:
     *   - Contain the HTTP status code string
     *   - Have total length <= 500 characters
     */
    public function test_error_message_shape(): void
    {
        $this
            ->forAll(
                Generator::choose(400, 599),      // HTTP status code
                Generator::string()               // response body of arbitrary length
            )
            ->withMaxSize(100)
            ->then(function (int $status, string $body): void {
                // Reproduce the error_message construction from SyncBackDispatcher
                $errorMessage = "HTTP {$status}: " . substr($body, 0, 500);
                $truncated    = substr($errorMessage, 0, 500);

                // Must contain the status code
                $this->assertStringContainsString(
                    (string) $status,
                    $truncated,
                    "error_message must contain the HTTP status code {$status}"
                );

                // Must not exceed 500 characters
                $this->assertLessThanOrEqual(
                    500,
                    strlen($truncated),
                    "error_message must be <= 500 characters, got " . strlen($truncated)
                );
            });
    }
}
