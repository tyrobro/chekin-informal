<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO;
use App\Features\PostEventSync\DTOs\EventSyncStatusDTO;
use App\Features\PostEventSync\Exceptions\SyncAlreadyCompleteException;
use App\Features\PostEventSync\Exceptions\SyncAlreadyInProgressException;
use App\Features\PostEventSync\Services\RetryService;
use App\Features\PostEventSync\Services\SyncBackDispatcher;
use PHPUnit\Framework\MockObject\MockObject;
use Tests\TestCase;

/**
 * Unit tests for RetryService (task 11.3)
 *
 * Requirements: 6.1, 6.2, 6.4, 6.5, 6.7
 *
 * @group c3-post-event-sync
 */
class RetryServiceTest extends TestCase
{
    private CheckpointRepository&MockObject        $checkpointRepo;
    private CheckedInAttendeeRepository&MockObject $attendeeRepo;
    private SyncBackDispatcher&MockObject          $dispatcher;
    private RetryService                           $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->checkpointRepo = $this->createMock(CheckpointRepository::class);
        $this->attendeeRepo   = $this->createMock(CheckedInAttendeeRepository::class);
        $this->dispatcher     = $this->createMock(SyncBackDispatcher::class);

        $this->service = new RetryService(
            $this->checkpointRepo,
            $this->attendeeRepo,
            $this->dispatcher,
        );
    }

    private function makeDto(
        string $status,
        int $lastBatch = 0,
        ?int $totalBatches = 3
    ): EventSyncStatusDTO {
        return new EventSyncStatusDTO(
            event_id:              'EVT-001',
            sync_status:           $status,
            last_successful_batch: $lastBatch,
            total_batches:         $totalBatches,
            completed_at:          null,
            error_message:         null,
        );
    }

    private function makeRecords(int $count): array
    {
        return array_map(
            fn (int $i) => new CheckedInAttendeeDTO("T-{$i}", '2026-06-15T09:14:23Z', 'Gate A', 'staff', 'qr_scan'),
            range(1, $count)
        );
    }

    public function test_complete_event_throws_sync_already_complete_exception(): void
    {
        $this->checkpointRepo->method('find')->willReturn($this->makeDto('complete'));
        $this->dispatcher->expects($this->never())->method('dispatch');

        $this->expectException(SyncAlreadyCompleteException::class);
        $this->service->retry('EVT-001', 'corr-id');
    }

    public function test_in_progress_event_throws_sync_already_in_progress_exception(): void
    {
        $this->checkpointRepo->method('find')->willReturn($this->makeDto('in_progress'));
        $this->dispatcher->expects($this->never())->method('dispatch');

        $this->expectException(SyncAlreadyInProgressException::class);
        $this->service->retry('EVT-001', 'corr-id');
    }

    public function test_failed_with_last_successful_batch_zero_dispatches_from_batch_1(): void
    {
        $this->checkpointRepo->method('find')->willReturn($this->makeDto('failed', 0, 3));
        $this->checkpointRepo->method('markInProgress');
        $this->checkpointRepo->method('recordComplete');

        // 3000 records = 3 batches
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(3000));

        $dispatchedNumbers = [];
        $this->dispatcher->method('dispatch')
            ->willReturnCallback(function ($batch) use (&$dispatchedNumbers) {
                $dispatchedNumbers[] = $batch->batch_number;
            });

        $startingFrom = $this->service->retry('EVT-001', 'corr-id');

        $this->assertSame(1, $startingFrom);
        $this->assertSame([1, 2, 3], $dispatchedNumbers);
    }

    public function test_failed_with_last_successful_batch_3_dispatches_from_batch_4(): void
    {
        $this->checkpointRepo->method('find')->willReturn($this->makeDto('failed', 3, 5));
        $this->checkpointRepo->method('markInProgress');
        $this->checkpointRepo->method('recordComplete');

        // 5000 records = 5 batches
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(5000));

        $dispatchedNumbers = [];
        $this->dispatcher->method('dispatch')
            ->willReturnCallback(function ($batch) use (&$dispatchedNumbers) {
                $dispatchedNumbers[] = $batch->batch_number;
            });

        $startingFrom = $this->service->retry('EVT-001', 'corr-id');

        $this->assertSame(4, $startingFrom);
        $this->assertSame([4, 5], $dispatchedNumbers);
    }

    public function test_mark_in_progress_called_before_first_dispatch(): void
    {
        $this->checkpointRepo->method('find')->willReturn($this->makeDto('failed', 0, 1));

        $callOrder = [];
        $this->checkpointRepo->method('markInProgress')
            ->willReturnCallback(function () use (&$callOrder) { $callOrder[] = 'markInProgress'; });
        $this->dispatcher->method('dispatch')
            ->willReturnCallback(function () use (&$callOrder) { $callOrder[] = 'dispatch'; });
        $this->checkpointRepo->method('recordComplete');

        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(1));

        $this->service->retry('EVT-001', 'corr-id');

        $this->assertSame(['markInProgress', 'dispatch'], $callOrder);
    }

    public function test_returns_starting_batch_number(): void
    {
        $this->checkpointRepo->method('find')->willReturn($this->makeDto('failed', 2, 4));
        $this->checkpointRepo->method('markInProgress');
        $this->checkpointRepo->method('recordComplete');
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(4000));
        $this->dispatcher->method('dispatch');

        $result = $this->service->retry('EVT-001', 'corr-id');

        $this->assertSame(3, $result); // last_successful_batch=2 → starts from 3
    }

    public function test_null_checkpoint_starts_from_batch_1(): void
    {
        $this->checkpointRepo->method('find')->willReturn(null);
        $this->checkpointRepo->method('markInProgress');
        $this->checkpointRepo->method('recordComplete');
        $this->attendeeRepo->method('fetchCheckedIn')->willReturn($this->makeRecords(1));

        $dispatchedNumbers = [];
        $this->dispatcher->method('dispatch')
            ->willReturnCallback(function ($batch) use (&$dispatchedNumbers) {
                $dispatchedNumbers[] = $batch->batch_number;
            });

        $startingFrom = $this->service->retry('EVT-001', 'corr-id');

        $this->assertSame(1, $startingFrom);
        $this->assertSame([1], $dispatchedNumbers);
    }
}
