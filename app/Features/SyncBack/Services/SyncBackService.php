<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Services;

use App\Features\SyncBack\Contracts\SyncErrorRepository;
use App\Features\SyncBack\Contracts\TicketRepository;
use App\Features\SyncBack\DTOs\CheckinRecordDTO;
use App\Features\SyncBack\DTOs\SyncBackRequestDTO;
use App\Features\SyncBack\DTOs\SyncBackResponseDTO;
use Carbon\Carbon;
use Psr\Log\LoggerInterface;

/**
 * Orchestrates the sync-back pipeline:
 *   1. Chunk the incoming records (default 500 per chunk).
 *   2. Per chunk: fetch existing tickets, classify each record, bulk-update
 *      valid ones, bulk-insert errors for missing ones.
 *   3. Emit structured JSON log entries at start, per-failure, and completion.
 *   4. Return a SyncBackResponseDTO with final counts.
 *
 * Classification per record:
 *   - not-found : ticket_id absent from the tickets table → log error, increment failed
 *   - duplicate : ticket already has the same checked_in_at → skip, increment succeeded
 *   - to-update : ticket exists and is not yet checked in → bulk update, increment succeeded
 *
 * Requirements: 3.1–3.5, 4.1–4.4, 5.1–5.3, 7.1–7.4, 8.1–8.4
 * Correctness Properties: 1 (count invariant), 2 (idempotency), 3 (error isolation),
 *                         4 (failure array completeness), 5 (duplicates as succeeded)
 */
class SyncBackService
{
    public function __construct(
        private readonly TicketRepository   $ticketRepo,
        private readonly SyncErrorRepository $syncErrorRepo,
        private readonly LoggerInterface    $logger,
        private readonly int                $chunkSize = 500,
    ) {}

    /**
     * Process a validated sync-back batch and return the response DTO.
     */
    public function process(SyncBackRequestDTO $dto): SyncBackResponseDTO
    {
        $startTime = microtime(true);
        $total     = count($dto->records);
        $response  = new SyncBackResponseDTO($dto->batch_id, $total);

        // Requirement 8.1 — log batch start
        $this->logger->info('sync_back.batch.started', [
            'event_id'      => $dto->event_id,
            'batch_id'      => $dto->batch_id,
            'total_records' => $total,
            'request_id'    => $dto->request_id,
        ]);

        $chunks = array_chunk($dto->records, $this->chunkSize);

        foreach ($chunks as $chunk) {
            $this->processChunk($dto, $chunk, $response);
        }

        // Requirement 8.2 — log batch completion
        $durationMs = (int) round((microtime(true) - $startTime) * 1000);
        $this->logger->info('sync_back.batch.completed', [
            'event_id'    => $dto->event_id,
            'batch_id'    => $dto->batch_id,
            'succeeded'   => $response->getSucceeded(),
            'failed'      => $response->getFailed(),
            'duration_ms' => $durationMs,
            'request_id'  => $dto->request_id,
        ]);

        return $response;
    }

    /**
     * Process a single chunk of CheckinRecordDTOs.
     *
     * @param CheckinRecordDTO[] $chunk
     */
    private function processChunk(
        SyncBackRequestDTO  $dto,
        array               $chunk,
        SyncBackResponseDTO $response
    ): void {
        // Step 1: Fetch existing tickets for this chunk (SELECT ticket_id, checked_in_at)
        $ticketIds   = array_map(static fn (CheckinRecordDTO $r): string => $r->ticket_id, $chunk);
        $existingMap = $this->ticketRepo->findByTicketIds($ticketIds);

        $toUpdate  = [];
        $errorRows = [];

        // Step 2: Classify each record
        foreach ($chunk as $record) {
            if (! isset($existingMap[$record->ticket_id])) {
                // Requirement 5.1–5.3: ticket not found — log, accumulate error row
                $this->logger->warning('sync_back.record.failed', [
                    'event_id'   => $dto->event_id,
                    'batch_id'   => $dto->batch_id,
                    'ticket_id'  => $record->ticket_id,
                    'reason'     => 'ticket not found in ExplaraX',
                    'request_id' => $dto->request_id,
                ]);

                $response->recordFailure($record->ticket_id, 'ticket not found in ExplaraX');

                $errorRows[] = [
                    'event_id'   => $dto->event_id,
                    'ticket_id'  => $record->ticket_id,
                    'reason'     => 'ticket not found in ExplaraX',
                    'payload'    => json_encode($record->toArray(), JSON_THROW_ON_ERROR),
                    'created_at' => Carbon::now('UTC')->toDateTimeString(),
                ];

                continue;
            }

            $existing = $existingMap[$record->ticket_id];

            // Requirement 4.1–4.3: idempotency — same checked_in_at means already applied
            if ($existing->checked_in_at !== null && $existing->checked_in_at === $record->checked_in_at) {
                $response->recordSuccess();
                continue;
            }

            // Record is valid and not yet applied — queue for bulk update
            $toUpdate[] = $record;
        }

        // Step 3: Bulk-update valid records (single UPDATE statement per chunk)
        if ($toUpdate !== []) {
            $this->ticketRepo->bulkUpdateCheckinFields($toUpdate);
            foreach ($toUpdate as $_) {
                $response->recordSuccess();
            }
        }

        // Step 4: Bulk-insert error rows (single INSERT statement per chunk)
        if ($errorRows !== []) {
            $this->syncErrorRepo->bulkInsert($errorRows);
        }
    }
}
