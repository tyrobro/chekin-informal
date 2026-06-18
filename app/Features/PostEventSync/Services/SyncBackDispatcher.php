<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Services;

use App\Features\PostEventSync\Contracts\CheckpointRepository;
use App\Features\PostEventSync\DTOs\SyncBatchDTO;
use App\Features\PostEventSync\Exceptions\PostEventSyncException;
use Illuminate\Support\Facades\Http;

/**
 * Dispatches a single batch of checked-in attendees to the C2 sync-back endpoint.
 *
 * Retry classification:
 *   - HTTP 200           → success, checkpoint recorded
 *   - HTTP 5xx / 429     → transient, exponential backoff up to 3 attempts
 *   - Network timeout    → transient, same retry logic
 *   - HTTP 4xx (non-429) → permanent failure, no retry
 *   - All retries exhausted → permanent failure
 *
 * On permanent failure:
 *   1. Persists error_message (HTTP status + truncated body, max 500 chars)
 *   2. Emits a critical monitoring alert
 *   3. Throws PostEventSyncException to halt orchestration for this event
 *
 * NOTE: PostEventSyncLogger is passed into dispatch() as a method parameter,
 * NOT injected via constructor. It is a per-run object carrying the correlation_id
 * and event_id for this specific sync run — the container cannot resolve it.
 *
 * batch_id is deterministic: hash('sha256', event_id.':'.batch_number)
 * This ensures C2 can deduplicate retried batches via its own idempotency guarantee.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.4
 */
class SyncBackDispatcher
{
    private const MAX_RETRIES = 3;

    /**
     * Backoff delay seconds indexed by attempt number (0-based).
     * Attempt 0: no delay, attempt 1: 2 s, attempt 2: 4 s, attempt 3: 8 s.
     *
     * @var int[]
     */
    private const RETRY_DELAYS = [0, 2, 4, 8];

    public function __construct(
        private readonly CheckpointRepository $checkpointRepo,
    ) {}

    /**
     * POST the batch to C2. Records the checkpoint on success.
     * Throws PostEventSyncException on permanent failure.
     *
     * @param PostEventSyncLogger $logger Per-run logger (not container-resolved)
     * @throws PostEventSyncException on permanent failure
     */
    public function dispatch(SyncBatchDTO $batch, string $correlationId, PostEventSyncLogger $logger): void
    {
        $syncBackUrl = (string) config('services.checkin.sync_back_url', env('CHECKIN_SYNC_BACK_URL', ''));
        $secret      = (string) env('CHECKIN_SYNC_BACK_SECRET', '');
        $baseDelay   = (int) env('SUPABASE_RETRY_DELAY', 1);

        $payload = [
            'event_id' => $batch->event_id,
            'batch_id' => $batch->batch_id,
            'records'  => array_map(
                static fn ($r) => $r->toCheckinRecord(),
                $batch->records
            ),
        ];

        $lastError  = null;
        $lastStatus = null;
        $lastBody   = '';

        for ($attempt = 0; $attempt < self::MAX_RETRIES; $attempt++) {
            if ($attempt > 0 && $baseDelay > 0) {
                sleep(self::RETRY_DELAYS[$attempt] * $baseDelay);
            }

            $logger->batchAttempt($batch->batch_number, $batch->batch_id, $attempt + 1);

            try {
                $startTime = microtime(true);

                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$secret}",
                    'Content-Type'  => 'application/json',
                ])
                ->post($syncBackUrl, $payload);

                $durationMs = (int) round((microtime(true) - $startTime) * 1000);
                $status     = $response->status();
                $body       = $response->body();

                // ── Success ────────────────────────────────────────────────
                if ($response->successful()) {
                    $this->checkpointRepo->recordBatchSuccess($batch->event_id, $batch->batch_number);
                    $logger->batchSuccess($batch->batch_number, $batch->batch_id, $durationMs);
                    return;
                }

                $lastStatus = $status;
                $lastBody   = $body;

                // ── Permanent 4xx (non-429) ────────────────────────────────
                if ($status >= 400 && $status < 500 && $status !== 429) {
                    $logger->batchFailed($batch->batch_number, $batch->batch_id, "HTTP {$status}: {$body}", true);
                    $this->permanentFail($batch, "HTTP {$status}: " . substr($body, 0, 500), $logger);
                    return; // unreachable — permanentFail always throws
                }

                // ── Transient (5xx or 429) ─────────────────────────────────
                $logger->batchFailed($batch->batch_number, $batch->batch_id, "HTTP {$status}: {$body}", false);
                $lastError = new PostEventSyncException(
                    "Batch {$batch->batch_number} transient failure HTTP {$status} for event {$batch->event_id}"
                );
            } catch (PostEventSyncException $e) {
                // Re-throw permanent failures immediately (from permanentFail())
                throw $e;
            } catch (\Exception $e) {
                // Network timeout or connection error — treat as transient
                $lastBody  = $e->getMessage();
                $lastError = new PostEventSyncException(
                    "Batch {$batch->batch_number} network exception for event {$batch->event_id}: {$e->getMessage()}",
                    0,
                    $e
                );
                $logger->batchFailed($batch->batch_number, $batch->batch_id, $e->getMessage(), false);
            }
        }

        // All retries exhausted — permanent failure
        $errorMessage = $lastStatus !== null
            ? "HTTP {$lastStatus}: " . substr($lastBody, 0, 500)
            : substr($lastBody, 0, 500);

        $this->permanentFail($batch, $errorMessage, $logger);
    }

    /**
     * Derive a stable, deterministic batch_id for a given event + batch number.
     *
     * batch_id = hash('sha256', event_id.':'.batch_number)
     *
     * Requirements: 4.2, 9.2
     */
    public static function deriveBatchId(string $eventId, int $batchNumber): string
    {
        return hash('sha256', $eventId . ':' . $batchNumber);
    }

    /**
     * Record the permanent failure, emit the monitoring alert, and throw.
     *
     * @throws PostEventSyncException always
     */
    private function permanentFail(SyncBatchDTO $batch, string $errorMessage, PostEventSyncLogger $logger): never
    {
        $truncated = substr($errorMessage, 0, 500);

        $this->checkpointRepo->recordFailed($batch->event_id, $truncated);
        $logger->monitoringAlert($batch->batch_number, $batch->batch_id, $truncated);

        throw new PostEventSyncException(
            "Permanent failure on batch {$batch->batch_number} for event {$batch->event_id}: {$truncated}"
        );
    }
}
