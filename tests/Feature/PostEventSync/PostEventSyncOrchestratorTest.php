<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO;
use App\Features\PostEventSync\Exceptions\PostEventSyncException;
use App\Features\PostEventSync\Services\PostEventSyncLogger;
use App\Features\PostEventSync\Services\PostEventSyncOrchestrator;
use App\Features\PostEventSync\Services\SyncBackDispatcher;
use PHPUnit\Framework\MockObject\MockObject;
use Tests\TestCase;

/**
 * Unit tests for PostEventSyncOrchestrator (task 10.3)
 *
 * Requirements: 2.3, 3.1, 8.1, 8.2
 *
 * @group c3-post-event-sync
 */
class PostEventSyncOrchestratorTest extends TestCase
{
    private CheckedInAttendeeRepository&MockObject $attendeeRepo;
    private CheckpointRepository&MockObject        $checkpointRepo;
    private SyncBackDispatcher&MockObject          $dispatcher;
    private PostEventSyncLogger                    $logger;
    private PostEventSyncOrchestrator              $orchestrator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->attendeeRepo   = $this->createMock(CheckedInAttendeeRepository::class);
        $this->checkpointRepo = $this->createMock(CheckpointRepository::class);
        $this->dispatcher     = $this->createMock(SyncBackDispatcher::class);
        $this->logger         = new PostEventSyncLogger('corr-id', 'EVT-TEST');

        $this->orchestrator = new PostEventSyncOrchestrator(
            $this->attendeeRepo,
            $this->checkpointRepo,
            $this->dispatcher,
        );
    }

    private function makeRecord(string $ticketId): CheckedInAttendeeDTO
    {
        return new CheckedInAttendeeDTO($ticketId, '2026-06-15T09:14:23Z', 'Gate A', 'staff-001', 'qr_scan');
    }

    private function makeRecords(int $count): array
    {
        return array_map(fn (int $i) => $this->makeRecord("T-{$i}"), range(1, $count));
    }

    public function test_upsert_pending_called_before_fetch(): void
    {
        $callOrder = [];

        $this->checkpointRepo
            ->expects($this->once())
            ->method('upsertPending')
            ->willReturnCallback(function () use (&$callOrder) { $callOrder[] = 'upsert'; });

        $this->attendeeRepo
            ->expects($this->once())
            ->method('fetchCheckedIn')
            ->willReturnCallback(function () use (&$callOrder) { $callOrder[] = 'fetch'; return []; });

        $this->checkpointRepo->method('recordComplete');

        $this->orchestrator->run('EVT-001', 'corr-id', $this->logger);

        $this->assertSame(['upsert', 'fetch'], $callOrder);
    }

    public function test_zero_records_calls_record_complete_and_no_dispatch(): void
    {
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn([]);

        $this->checkpointRepo->expects($this->once())->method('upsertPending');
        $this->checkpointRepo->expects($this->once())->method('recordComplete');
        $this->checkpointRepo->expects($this->never())->method('markInProgress');

        $this->dispatcher->expects($this->never())->method('dispatch');

        $this->orchestrator->run('EVT-001', 'corr-id', $this->logger);
    }

    public function test_mark_in_progress_called_with_correct_total_batches(): void
    {
        // 2500 records → ceil(2500/1000) = 3 batches
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(2500));

        $this->checkpointRepo
            ->expects($this->once())
            ->method('markInProgress')
            ->with('EVT-001', 3);

        $this->checkpointRepo->method('upsertPending');
        $this->checkpointRepo->method('recordComplete');
        $this->dispatcher->method('dispatch');

        $this->orchestrator->run('EVT-001', 'corr-id', $this->logger);
    }

    public function test_dispatch_called_for_each_batch(): void
    {
        // 2 full batches + 1 partial = 2001 records → 3 batches
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(2001));

        $this->checkpointRepo->method('upsertPending');
        $this->checkpointRepo->method('markInProgress');
        $this->checkpointRepo->method('recordComplete');

        $this->dispatcher
            ->expects($this->exactly(3))
            ->method('dispatch');

        $this->orchestrator->run('EVT-001', 'corr-id', $this->logger);
    }

    public function test_batch_ids_are_deterministic(): void
    {
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(1));

        $this->checkpointRepo->method('upsertPending');
        $this->checkpointRepo->method('markInProgress');
        $this->checkpointRepo->method('recordComplete');

        $dispatchedBatchIds = [];

        $this->dispatcher
            ->method('dispatch')
            ->willReturnCallback(function ($batch) use (&$dispatchedBatchIds) {
                $dispatchedBatchIds[] = $batch->batch_id;
            });

        $this->orchestrator->run('EVT-001', 'corr-id', $this->logger);

        $expected = SyncBackDispatcher::deriveBatchId('EVT-001', 1);
        $this->assertSame($expected, $dispatchedBatchIds[0]);
    }

    public function test_record_complete_called_after_all_dispatches(): void
    {
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(1));

        $callOrder = [];
        $this->checkpointRepo->method('upsertPending');
        $this->checkpointRepo->method('markInProgress');
        $this->dispatcher->method('dispatch')
            ->willReturnCallback(function () use (&$callOrder) { $callOrder[] = 'dispatch'; });
        $this->checkpointRepo->expects($this->once())->method('recordComplete')
            ->willReturnCallback(function () use (&$callOrder) { $callOrder[] = 'complete'; });

        $this->orchestrator->run('EVT-001', 'corr-id', $this->logger);

        $this->assertSame(['dispatch', 'complete'], $callOrder);
    }

    public function test_exception_from_dispatcher_propagates(): void
    {
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(1));

        $this->checkpointRepo->method('upsertPending');
        $this->checkpointRepo->method('markInProgress');

        $this->dispatcher->method('dispatch')
            ->willThrowException(new PostEventSyncException('batch failed'));

        $this->expectException(PostEventSyncException::class);

        $this->orchestrator->run('EVT-001', 'corr-id', $this->logger);
    }
}
