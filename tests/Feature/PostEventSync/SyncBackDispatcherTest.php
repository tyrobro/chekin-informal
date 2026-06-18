<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO;
use App\Features\PostEventSync\DTOs\SyncBatchDTO;
use App\Features\PostEventSync\Exceptions\PostEventSyncException;
use App\Features\PostEventSync\Services\PostEventSyncLogger;
use App\Features\PostEventSync\Services\SyncBackDispatcher;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\MockObject\MockObject;
use Tests\TestCase;

/**
 * Unit tests for SyncBackDispatcher (task 9.3)
 *
 * Requirements: 4.3, 4.4, 4.5, 4.6
 *
 * @group c3-post-event-sync
 */
class SyncBackDispatcherTest extends TestCase
{
    private CheckpointRepository&MockObject $checkpointRepo;
    private SyncBackDispatcher $dispatcher;
    private PostEventSyncLogger $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->checkpointRepo = $this->createMock(CheckpointRepository::class);
        $this->dispatcher     = new SyncBackDispatcher($this->checkpointRepo);
        $this->logger         = new PostEventSyncLogger('corr-id-test', 'EVT-TEST');
    }

    private function makeBatch(string $eventId = 'EVT-001', int $batchNumber = 1): SyncBatchDTO
    {
        return new SyncBatchDTO(
            event_id:     $eventId,
            batch_number: $batchNumber,
            batch_id:     SyncBackDispatcher::deriveBatchId($eventId, $batchNumber),
            records:      [
                new CheckedInAttendeeDTO('T-001', '2026-06-15T09:14:23Z', 'Gate A', 'staff-001', 'qr_scan'),
            ],
        );
    }

    public function test_200_response_calls_record_batch_success_once(): void
    {
        Http::fake(['*' => Http::response(['succeeded' => 1], 200)]);

        $this->checkpointRepo
            ->expects($this->once())
            ->method('recordBatchSuccess')
            ->with('EVT-001', 1);

        $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
    }

    public function test_200_response_does_not_call_record_failed(): void
    {
        Http::fake(['*' => Http::response(['succeeded' => 1], 200)]);

        $this->checkpointRepo
            ->expects($this->never())
            ->method('recordFailed');

        $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
    }

    public function test_500_response_retries_exactly_3_times_then_throws(): void
    {
        $callCount = 0;

        Http::fake([
            '*' => function () use (&$callCount) {
                $callCount++;
                return Http::response('Internal Server Error', 500);
            },
        ]);

        $this->checkpointRepo->expects($this->once())->method('recordFailed');

        $this->expectException(PostEventSyncException::class);

        try {
            $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
        } finally {
            $this->assertSame(3, $callCount, 'Must attempt exactly 3 times (MAX_RETRIES)');
        }
    }

    public function test_4xx_non_429_is_permanent_failure_without_retry(): void
    {
        $callCount = 0;

        Http::fake([
            '*' => function () use (&$callCount) {
                $callCount++;
                return Http::response('Bad Request', 400);
            },
        ]);

        $this->checkpointRepo->expects($this->once())->method('recordFailed');
        $this->expectException(PostEventSyncException::class);

        try {
            $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
        } finally {
            $this->assertSame(1, $callCount, '4xx must not retry — only 1 attempt expected');
        }
    }

    public function test_403_is_permanent_failure_without_retry(): void
    {
        $callCount = 0;

        Http::fake([
            '*' => function () use (&$callCount) {
                $callCount++;
                return Http::response('Forbidden', 403);
            },
        ]);

        $this->expectException(PostEventSyncException::class);

        try {
            $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
        } finally {
            $this->assertSame(1, $callCount, '403 is 4xx — must not retry');
        }
    }

    public function test_429_response_retries_up_to_3_times(): void
    {
        $callCount = 0;

        Http::fake([
            '*' => function () use (&$callCount) {
                $callCount++;
                return Http::response('Too Many Requests', 429);
            },
        ]);

        $this->checkpointRepo->expects($this->once())->method('recordFailed');
        $this->expectException(PostEventSyncException::class);

        try {
            $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
        } finally {
            $this->assertSame(3, $callCount, '429 is transient — must retry 3 times');
        }
    }

    public function test_record_failed_called_with_truncated_error_message(): void
    {
        $longBody = str_repeat('X', 600); // longer than 500 char cap

        Http::fake(['*' => Http::response($longBody, 500)]);

        $this->checkpointRepo
            ->expects($this->once())
            ->method('recordFailed')
            ->with(
                'EVT-001',
                $this->callback(function (string $msg): bool {
                    return strlen($msg) <= 500 && str_contains($msg, '500');
                })
            );

        $this->expectException(PostEventSyncException::class);
        $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
    }

    public function test_record_failed_not_called_on_success(): void
    {
        Http::fake(['*' => Http::response(['succeeded' => 1], 200)]);

        $this->checkpointRepo->expects($this->never())->method('recordFailed');

        $this->dispatcher->dispatch($this->makeBatch(), 'corr-id', $this->logger);
    }
}
