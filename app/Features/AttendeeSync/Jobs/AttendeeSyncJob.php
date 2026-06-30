<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Jobs;

use App\Features\AttendeeSync\Contracts\EventPreparationRepository;
use App\Features\AttendeeSync\Contracts\ExplaraXAttendeeRepository;
use App\Features\AttendeeSync\Contracts\HmacKeyRepository;
use App\Features\AttendeeSync\DTOs\AttendeeDTO;
use App\Features\AttendeeSync\DTOs\AttendeeUpsertDTO;
use App\Features\AttendeeSync\DTOs\EventPreparationDTO;
use App\Features\AttendeeSync\Services\AdvisoryLockService;
use App\Features\AttendeeSync\Services\QrTokenService;
use App\Features\AttendeeSync\Services\SupabaseUpsertService;
use App\Features\AttendeeSync\Services\SyncLogger;
use App\Features\AttendeeSync\Support\BatchPartitioner;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AttendeeSyncJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * All retry logic is handled internally (batch-level exponential backoff
     * inside SupabaseUpsertService). The job itself runs exactly once.
     */
    public int $tries = 1;

    /**
     * 6 minutes — comfortable for 10 K attendees across 100-record batches.
     */
    public int $timeout = 360;

    public function __construct(
        private readonly int    $eventId,
        private readonly string $syncId,
        private readonly string $queuedAt,
    ) {}

    /**
     * Fetch the event name from the ExplaraX Events API.
     * Returns null on failure (non-fatal — sync continues without event_name).
     * Skipped in testing environment to avoid unfaked HTTP requests.
     */
    private function fetchEventName(): ?string
    {
        // Skip network call in testing to prevent stray HTTP requests
        if (app()->environment('testing')) {
            return null;
        }

        try {
            $baseUrl = rtrim((string) config('services.explara.events_url', env('EXPLARA_EVENTS_URL', 'https://event.explarax.com')), '/');
            $token = (string) config('services.explara.api_token', env('EXPLARA_API_TOKEN', ''));
            $res = Http::withToken($token)
                ->get("{$baseUrl}/api/event");

            if (!$res->successful()) return null;

            $events = $res->json();
            $list = is_array($events['data'] ?? null) ? $events['data'] : (is_array($events) ? $events : []);

            foreach ($list as $event) {
                if (isset($event['id']) && (int) $event['id'] === $this->eventId) {
                    return $event['name'] ?? $event['title'] ?? null;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('AttendeeSyncJob: could not fetch event name', [
                'event_id' => $this->eventId,
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }

    /**
     * Write the preparation status to Supabase event_preparations table.
     * This allows the frontend to read the preparation state.
     * Non-fatal — failure is logged but does not block the sync.
     */
    private function writePreparationToSupabase(string $status, int $attendeeCount = 0, int $batchCount = 0): void
    {
        if (app()->environment('testing')) {
            return;
        }

        try {
            $supabaseUrl = rtrim((string) env('SUPABASE_URL', ''), '/');
            $serviceKey  = (string) env('SUPABASE_SERVICE_ROLE_KEY', '');

            Http::withHeaders([
                'Authorization' => "Bearer {$serviceKey}",
                'apikey'        => $serviceKey,
                'Content-Type'  => 'application/json',
                'Prefer'        => 'resolution=merge-duplicates',
            ])
            ->withQueryParameters(['on_conflict' => 'event_id'])
            ->post("{$supabaseUrl}/rest/v1/event_preparations", [
                'event_id'       => $this->eventId,
                'sync_id'        => $this->syncId,
                'status'         => $status,
                'prepared_at'    => now()->toIso8601String(),
                'attendee_count' => $attendeeCount,
                'batch_count'    => $batchCount,
            ]);
        } catch (\Throwable $e) {
            Log::warning('AttendeeSyncJob: could not write preparation to Supabase', [
                'event_id' => $this->eventId,
                'error'    => $e->getMessage(),
            ]);
        }
    }

    /**
     * Execute the full attendee sync pipeline.
     *
     * The entire body — including the initial in_progress write — is wrapped in
     * an outer try/catch(\Throwable) so that NO exception, at any stage, can
     * leave event_preparations stuck in 'in_progress'. A second innermost
     * fallback uses raw SQL as a last resort if $prepRepo itself throws.
     *
     * Pipeline steps:
     *   1. Mark event_preparations as in_progress.
     *   2. Log sync.started.
     *   3. Fetch attendees from ExplaraX Payments API (paginated, retried).
     *   4. Get / create per-event HMAC key.
     *   5. Sign each attendee → AttendeeUpsertDTO (company folded into metadata).
     *   6. Upsert to Supabase in batches; update processed count after each batch.
     *   7. Mark event_preparations as completed.
     *   8. Release advisory lock, log sync.completed.
     *
     * Requirements: 4.1–4.5, 5.1–5.6, 6.1–6.7, 7.1–7.3, 8.1–8.5, 11.2–11.6
     */
    public function handle(
        ExplaraXAttendeeRepository $attendeeRepo,
        SupabaseUpsertService      $supabaseService,
        HmacKeyRepository          $hmacRepo,
        EventPreparationRepository $prepRepo,
        AdvisoryLockService        $lockService,
        QrTokenService             $qrTokenService,
    ): void {
        $logger    = new SyncLogger($this->syncId, $this->eventId);
        $startedAt = Carbon::now();

        // ─────────────────────────────────────────────────────────────────────
        // OUTER GUARD — catches every exception including the in_progress write.
        // The event_preparations row MUST reach a terminal state before this
        // method returns, regardless of what throws.
        // ─────────────────────────────────────────────────────────────────────
        try {
            // ── Step 1: Mark as in_progress immediately.
            //            This write is inside the try so a DB failure here is
            //            caught and surfaced rather than leaving a dangling lock. ──
            $prepRepo->upsert(EventPreparationDTO::inProgress($this->eventId, $this->syncId));

            // ── Step 2: Log ──
            $logger->started($this->queuedAt);

            // ── Step 3: Fetch attendees from ExplaraX core (NOT Supabase).
            //            HttpExplaraXAttendeeRepository hits:
            //              GET {EXPLARA_PAYMENTS_URL}/api/event/{id}/attendees
            //            This is the ExplaraX Payments API — the source of truth
            //            for attendee records. It has nothing to do with the
            //            Supabase event_attendees table. ──
            $attendeeDtos = $attendeeRepo->fetchAllForEvent($this->eventId);
            $totalCount   = count($attendeeDtos);

            // ── Step 4: Stable per-event HMAC key ──
            $hmacKey = $hmacRepo->getOrCreate($this->eventId);

            // ── Step 5: Sign each attendee.
            //            fromAttendeeDTO() folds 'company' into the metadata
            //            array, so toUpsertArray() never emits a top-level
            //            'company' key — preventing PGRST204 from Supabase. ──
            //
            //            Also passes event_name so it's included in the upsert.
            //            Event name is fetched once from the ExplaraX Events API.
            $eventName = $this->fetchEventName();

            $upsertDtos = array_map(
                static fn (AttendeeDTO $dto) => AttendeeUpsertDTO::fromAttendeeDTO(
                    $dto,
                    $qrTokenService->sign($dto->ticket_id, $hmacKey),
                    $eventName
                ),
                $attendeeDtos
            );
            unset($hmacKey); // clear from memory immediately

            // ── Step 6: Batch upsert to Supabase with live progress updates ──
            // Default batch size is 5 — small enough that multi-batch progress
            // updates are visible in the UI even for small test events.
            // Override with SYNC_BATCH_SIZE env var for production.
            $batchSize    = max(1, (int) env('SYNC_BATCH_SIZE', 5));
            $batches      = BatchPartitioner::partition($upsertDtos, $batchSize);
            $totalBatches = count($batches);
            $processed    = 0;

            foreach ($batches as $batchIndex => $batch) {
                $batchNumber  = $batchIndex + 1;
                $batchStartMs = (int) (microtime(true) * 1000);

                $rows = array_map(
                    static fn (AttendeeUpsertDTO $dto) => $dto->toUpsertArray(),
                    $batch
                );

                $supabaseService->upsertBatch($batchNumber, $rows);

                $processed += count($batch);

                // Write live count so the status poller sees the bar move.
                $prepRepo->updateProgress($this->eventId, $processed);

                $durationMs = (int) (microtime(true) * 1000) - $batchStartMs;
                $logger->batchCompleted($batchNumber, count($batch), $durationMs);
            }

            // ── Step 7: Terminal success ──
            $prepRepo->upsert(
                EventPreparationDTO::completed($this->eventId, $this->syncId, $totalCount, $totalBatches)
            );

            // ── Step 7b: Write completion status to Supabase so frontend can read it ──
            $this->writePreparationToSupabase('completed', $totalCount, $totalBatches);

            // ── Step 8: Release lock and log ──
            $lockService->release($this->eventId);
            $logger->completed($totalCount, $totalBatches, (int) $startedAt->diffInMilliseconds(Carbon::now()));

        } catch (\Throwable $primary) {
            // ── Terminal failure path ─────────────────────────────────────────
            // Log the root cause first — this is what you need for debugging.
            Log::error('AttendeeSyncJob: sync failed', [
                'event_id'  => $this->eventId,
                'sync_id'   => $this->syncId,
                'exception' => $primary::class,
                'message'   => $primary->getMessage(),
                'file'      => $primary->getFile(),
                'line'      => $primary->getLine(),
                'trace'     => $primary->getTraceAsString(),
            ]);

            // Write the failed status via the repository.
            // If the repository itself throws (e.g. DB unreachable), fall back
            // to a raw SQL statement — the absolute last resort so the record
            // never stays in in_progress permanently.
            try {
                $prepRepo->upsert(
                    EventPreparationDTO::failed($this->eventId, $this->syncId, $primary->getMessage())
                );
            } catch (\Throwable $repoFailure) {
                Log::critical('AttendeeSyncJob: could not write failed status via repository — attempting raw SQL fallback', [
                    'event_id'       => $this->eventId,
                    'sync_id'        => $this->syncId,
                    'repo_exception' => $repoFailure->getMessage(),
                ]);

                // Raw SQL fallback — bypasses the ORM entirely.
                try {
                    DB::statement(
                        "UPDATE event_preparations
                         SET status = 'failed',
                             error_message = ?,
                             updated_at = NOW()
                         WHERE event_id = ?",
                        [
                            mb_substr($primary->getMessage(), 0, 1000),
                            $this->eventId,
                        ]
                    );
                } catch (\Throwable) {
                    // If even the raw SQL fails (DB completely down) there is
                    // nothing more we can do — log and continue to lock release.
                    Log::critical('AttendeeSyncJob: raw SQL fallback also failed — event_preparations may be stuck', [
                        'event_id' => $this->eventId,
                        'sync_id'  => $this->syncId,
                    ]);
                }
            }

            // Always release the advisory lock — a held lock blocks all future
            // sync attempts for this event, regardless of the failure cause.
            try {
                $lockService->release($this->eventId);
            } catch (\Throwable $lockFailure) {
                Log::warning('AttendeeSyncJob: advisory lock release failed', [
                    'event_id' => $this->eventId,
                    'message'  => $lockFailure->getMessage(),
                ]);
            }

            $logger->failed(0, $primary->getMessage());

            // Rethrow so Laravel marks the job as failed in the jobs table
            // and the queue monitor can alert on it.
            throw $primary;
        }
    }
}
