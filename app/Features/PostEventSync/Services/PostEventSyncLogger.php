<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Services;

use Illuminate\Support\Facades\Log;

class PostEventSyncLogger
{
    public function __construct(
        private readonly string $correlationId,
        private readonly string $eventId,
    ) {}

    public function syncStarted(): void
    {
        $this->log('info', 'post_event_sync.event.started', [
            'sync_status' => 'pending',
        ]);
    }

    public function syncCompleted(int $totalBatches, int $durationMs): void
    {
        $this->log('info', 'post_event_sync.event.complete', [
            'sync_status'   => 'complete',
            'total_batches' => $totalBatches,
            'duration_ms'   => $durationMs,
        ]);
    }

    public function syncFailed(string $errorMessage): void
    {
        $this->log('error', 'post_event_sync.event.failed', [
            'sync_status'   => 'failed',
            'error_message' => $errorMessage,
        ]);
    }

    public function batchAttempt(int $batchNumber, string $batchId, int $attempt): void
    {
        $this->log('info', 'post_event_sync.batch.attempt', [
            'sync_status'  => 'in_progress',
            'batch_number' => $batchNumber,
            'batch_id'     => $batchId,
            'attempt'      => $attempt,
        ]);
    }

    public function batchSuccess(int $batchNumber, string $batchId, int $durationMs): void
    {
        $this->log('info', 'post_event_sync.batch.success', [
            'sync_status'  => 'in_progress',
            'batch_number' => $batchNumber,
            'batch_id'     => $batchId,
            'duration_ms'  => $durationMs,
        ]);
    }

    public function batchFailed(int $batchNumber, string $batchId, string $error, bool $permanent): void
    {
        $level = $permanent ? 'error' : 'warning';

        $this->log($level, 'post_event_sync.batch.failed', [
            'sync_status'  => $permanent ? 'failed' : 'in_progress',
            'batch_number' => $batchNumber,
            'batch_id'     => $batchId,
            'error'        => $error,
            'permanent'    => $permanent,
        ]);
    }

    public function monitoringAlert(int $batchNumber, string $batchId, string $errorMessage): void
    {
        $channel = config('logging.channels.post_event_sync_alerts', 'stack');

        Log::channel($channel)->critical('post_event_sync.monitoring_alert', [
            'correlation_id' => $this->correlationId,
            'event_id'       => $this->eventId,
            'sync_status'    => 'failed',
            'batch_number'   => $batchNumber,
            'batch_id'       => $batchId,
            'error_message'  => $errorMessage,
        ]);
    }

    private function log(string $level, string $event, array $context = []): void
    {
        $mergedContext = array_merge([
            'correlation_id' => $this->correlationId,
            'event_id'       => $this->eventId,
        ], $context);

        Log::channel('json_daily')->{$level}($event, $mergedContext);
    }
}
