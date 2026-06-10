<?php
declare(strict_types=1);

namespace App\Features\AttendeeSync\Services;

use Illuminate\Support\Facades\Log;

class SyncLogger
{
    public function __construct(
        private readonly string $syncId,
        private readonly int    $eventId,
    ) {}

    public function started(string $queuedAt): void
    {
        $this->log('sync.started', ['queued_at' => $queuedAt]);
    }

    public function batchCompleted(int $batchNumber, int $recordCount, int $durationMs): void
    {
        $this->log('batch.completed', [
            'batch_number' => $batchNumber,
            'record_count' => $recordCount,
            'duration_ms'  => $durationMs,
        ]);
    }

    public function batchRetry(int $batchNumber, int $attemptNumber, string $errorMessage): void
    {
        $this->log('batch.retry', [
            'batch_number'   => $batchNumber,
            'attempt_number' => $attemptNumber,
            'error_message'  => $errorMessage,
        ]);
    }

    public function completed(int $totalAttendees, int $totalBatches, int $durationMs): void
    {
        $this->log('sync.completed', [
            'total_attendees' => $totalAttendees,
            'total_batches'   => $totalBatches,
            'duration_ms'     => $durationMs,
        ]);
    }

    public function failed(int $failedBatch, string $errorMessage): void
    {
        $this->log('sync.failed', [
            'failed_batch'  => $failedBatch,
            'error_message' => $errorMessage,
        ]);
    }

    private function log(string $event, array $context = []): void
    {
        Log::channel('json_daily')->info($event, array_merge([
            'sync_id'  => $this->syncId,
            'event_id' => $this->eventId,
        ], $context));
    }
}
