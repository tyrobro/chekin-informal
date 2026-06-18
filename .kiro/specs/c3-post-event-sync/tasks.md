# Implementation Plan: C3 — Post-Event Sync-Back Orchestration

## Overview

Implement automatic post-event sync-back orchestration for ExplaraX Check-in. This slice
adds the `event_sync_status` PostgreSQL table, the `app/Features/PostEventSync/` feature
folder with all services, repositories, DTOs, contracts, and exceptions, a scheduled
Artisan command (`checkin:post-event-sync`) that fires every 5 minutes with
`withoutOverlapping()`, a manual retry endpoint
(`POST /internal/checkin/retry-sync/{event_id}`), and PHPUnit/PestPHP tests covering all
12 correctness properties plus unit and integration tests.

**Language:** PHP 8.4 / Laravel 12
**Test runner:** PHPUnit (PestPHP syntax)
**DO NOT modify** any C1 (`app/Features/AttendeeSync/`) or C2 (`app/Features/SyncBack/`) files.

---

## Tasks

- [x] 1. Create migration: `database/migrations/2026_06_17_000001_create_event_sync_status_table.php`
  - Follow the exact Blueprint pattern of `create_event_preparations_table.php`
  - Columns: `bigIncrements('id')`, `string('event_id', 100)`, `string('sync_status', 20)->default('pending')`, `integer('last_successful_batch')->default(0)`, `integer('total_batches')->nullable()`, `timestampTz('completed_at')->nullable()`, `text('error_message')->nullable()`, `timestamp('created_at')->useCurrent()`, `timestamp('updated_at')->useCurrent()`
  - Add `unique('event_id', 'uq_event_sync_status_event_id')` and `index('sync_status', 'idx_event_sync_status_eligible')`
  - Include `down()` that calls `Schema::dropIfExists('event_sync_status')`
  - _Requirements: 5.4, 5.5, 8.1, 8.3_


- [ ] 2. Define the three contract interfaces
  - [x] 2.1 Create `app/Features/PostEventSync/Contracts/CheckedInAttendeeRepository.php`
    - Single method: `fetchCheckedIn(string $eventId): array` — docblock `@return CheckedInAttendeeDTO[]`
    - `declare(strict_types=1)`, correct namespace
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 2.2 Create `app/Features/PostEventSync/Contracts/CheckpointRepository.php`
    - Methods: `upsertPending`, `markInProgress`, `recordBatchSuccess`, `recordComplete`, `recordFailed`, `find` — exact signatures from design.md; `find` returns `?EventSyncStatusDTO`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2_
  - [x] 2.3 Create `app/Features/PostEventSync/Contracts/EventFinderContract.php`
    - Single method: `findEligible(): array` — docblock `@return string[]`
    - _Requirements: 1.2, 1.3, 1.6_

- [x] 3. Create the three DTO value objects
  - [x] 3.1 Create `app/Features/PostEventSync/DTOs/CheckedInAttendeeDTO.php`
    - `readonly` class; constructor properties: `ticket_id`, `checked_in_at`, `checked_in_gate`, `checked_in_by`, `checkin_method` (all strings)
    - Static factory `fromSupabaseRow(array $row): self`
    - Method `toCheckinRecord(): array` returning C2-contract-compatible shape
    - _Requirements: 2.2_
  - [x] 3.2 Create `app/Features/PostEventSync/DTOs/EventSyncStatusDTO.php`
    - `readonly` class; constructor: `event_id` (string), `sync_status` (string), `last_successful_batch` (int), `total_batches` (?int), `completed_at` (?string), `error_message` (?string)
    - _Requirements: 5.1, 6.1_
  - [x] 3.3 Create `app/Features/PostEventSync/DTOs/SyncBatchDTO.php`
    - `readonly` class: `event_id` (string), `batch_number` (int), `batch_id` (string), `records` (array)
    - Docblock: `batch_id = hash('sha256', event_id.':'.batch_number)`
    - _Requirements: 4.2, 9.2_


- [x] 4. Create the three domain exception classes in `app/Features/PostEventSync/Exceptions/`
  - `PostEventSyncException extends \RuntimeException` — base class, strict typing
  - `SyncAlreadyCompleteException extends PostEventSyncException` — thrown when retry called on a complete event
  - `SyncAlreadyInProgressException extends PostEventSyncException` — thrown when retry called on in-progress event
  - _Requirements: 6.4, 6.5_

- [x] 5. Implement `PostEventSyncLogger` service
  - [x] 5.1 Create `app/Features/PostEventSync/Services/PostEventSyncLogger.php`
    - Constructor: `string $correlationId`, `string $eventId` — NOT container-bound; constructed per run
    - Public methods: `syncStarted()`, `syncCompleted(int $totalBatches, int $durationMs)`, `syncFailed(string $errorMessage)`, `batchAttempt(int $batchNumber, string $batchId, int $attempt)`, `batchSuccess(int $batchNumber, string $batchId, int $durationMs)`, `batchFailed(int $batchNumber, string $batchId, string $error, bool $permanent)`, `monitoringAlert(int $batchNumber, string $batchId, string $errorMessage)`
    - Private `log(string $level, string $event, array $context = []): void` writes to `Log::channel('json_daily')`
    - Every entry includes `correlation_id`, `event_id`, `sync_status` fields
    - `monitoringAlert` writes at `critical` level to `config('logging.channels.post_event_sync_alerts', 'stack')`
    - _Requirements: 7.1, 7.2, 10.1, 10.2, 10.3, 10.4_
  - [ ]* 5.2 Write property test for `PostEventSyncLogger` — Property 11
    - File: `tests/Property/PostEventSync/PostEventSyncLoggerPropertyTest.php`
    - **Property 11: Structured Log Completeness**
    - **Validates: Requirements 4.7, 10.2, 10.3**
    - For 100 random `(correlationId, eventId, batchNumber, batchId, durationMs)` inputs, assert every log entry contains `correlation_id`, `event_id`, `sync_status`; dispatcher entries also include `batch_number`, `batch_id`, `duration_ms`


- [x] 6. Implement `PostgresCheckpointRepository`
  - [x] 6.1 Create `app/Features/PostEventSync/Repositories/PostgresCheckpointRepository.php`
    - Implements `CheckpointRepository`; constructor injects `\Illuminate\Database\ConnectionInterface $db`
    - `upsertPending`: `INSERT INTO event_sync_status (event_id, sync_status) VALUES (?, 'pending') ON CONFLICT (event_id) DO NOTHING`
    - `markInProgress`: single `UPDATE` — `sync_status = 'in_progress'`, `total_batches = ?`, `updated_at = NOW()`
    - `recordBatchSuccess`: single atomic `UPDATE` — `last_successful_batch = ?`, `sync_status = 'in_progress'`, `updated_at = NOW()`
    - `recordComplete`: single `UPDATE` — `sync_status = 'complete'`, `completed_at = NOW()`, `updated_at = NOW()`
    - `recordFailed`: single `UPDATE` — `sync_status = 'failed'`, `error_message = ?`, `updated_at = NOW()`
    - `find`: `SELECT * FROM event_sync_status WHERE event_id = ?` → `?EventSyncStatusDTO`
    - All writes via `DB::statement()` following `PostgresEventPreparationRepository` pattern — no Eloquent model
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3_
  - [ ]* 6.2 Write property tests for `PostgresCheckpointRepository` — Properties 5 & 12
    - File: `tests/Property/PostEventSync/PostgresCheckpointRepositoryPropertyTest.php`
    - **Property 5: Checkpoint Monotonicity** — for 100 random batch sequences `[1..K]`, call `recordBatchSuccess` in order, assert `last_successful_batch` never decreases; **Validates: Requirement 5.1**
    - **Property 12: `total_batches` Accuracy** — for 100 random N (1–10,000), call `markInProgress(event_id, ceil(N/1000))`, assert persisted `total_batches = ceil(N/1000)`; **Validates: Requirement 8.3**
  - [ ]* 6.3 Write unit tests for `PostgresCheckpointRepository`
    - File: `tests/Feature/PostEventSync/PostgresCheckpointRepositoryTest.php`
    - Test: `upsertPending` is a no-op on conflict (second call leaves row unchanged)
    - Test: `find` returns `null` for unknown `event_id`
    - Test: unique constraint on `event_id` enforced (duplicate raw insert throws)
    - _Requirements: 5.4, 5.5_


- [x] 7. Implement `PostgresCheckedInAttendeeRepository`
  - [x] 7.1 Create `app/Features/PostEventSync/Repositories/PostgresCheckedInAttendeeRepository.php`
    - Implements `CheckedInAttendeeRepository`
    - Issues Supabase REST `GET /rest/v1/event_attendees?event_id=eq.{id}&checked_in_at=not.is.null&select=ticket_id,checked_in_at,checked_in_gate,checked_in_by,checkin_method`
    - Headers: `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`, `apikey: {SUPABASE_SERVICE_ROLE_KEY}`
    - Exponential backoff delays `[0, 2, 4, 8]` seconds, up to 3 retries, respecting `SUPABASE_RETRY_DELAY` env multiplier — same pattern as `HttpExplaraXAttendeeRepository`
    - Maps response rows through `CheckedInAttendeeDTO::fromSupabaseRow()`; throws `PostEventSyncException` after all retries exhausted
    - _Requirements: 2.1, 2.2, 2.4_
  - [ ]* 7.2 Write property test for `PostgresCheckedInAttendeeRepository` — Property 3
    - File: `tests/Property/PostEventSync/PostgresCheckedInAttendeeRepositoryPropertyTest.php`
    - **Property 3: CheckedIn Attendee Filter**
    - **Validates: Requirements 2.1, 2.2, 2.4**
    - For 100 random mixes of checked-in / not-checked-in rows, mock Supabase HTTP response, assert exactly K records returned, each with all 5 required fields, none with null `checked_in_at`
  - [ ]* 7.3 Write unit tests for `PostgresCheckedInAttendeeRepository`
    - File: `tests/Feature/PostEventSync/PostgresCheckedInAttendeeRepositoryTest.php`
    - Test: Supabase REST URL and query parameters built correctly
    - Test: retries on Supabase 500 (up to 3 attempts, then throws)
    - Test: returns empty array when Supabase responds with `[]`
    - _Requirements: 2.1, 2.4_


- [ ] 8. Implement `EventFinderService`
  - [x] 8.1 Create `app/Features/PostEventSync/Services/EventFinderService.php`
    - Implements `EventFinderContract`; constructor injects `\Illuminate\Database\ConnectionInterface $db`
    - SQL: `SELECT event_id FROM event_sync_status WHERE sync_status <> 'complete' AND event_id IN (SELECT id FROM events WHERE end_time < NOW())`
    - Returns `string[]` (plain array of event_id values)
    - _Requirements: 1.2, 1.3, 1.6_
  - [ ]* 8.2 Write property test for `EventFinderService` — Property 2
    - File: `tests/Property/PostEventSync/EventFinderServicePropertyTest.php`
    - **Property 2: EventFinder Eligibility Filter**
    - **Validates: Requirements 1.2, 1.3, 1.6**
    - For 100 random sets of rows with arbitrary `sync_status` and `end_time` combinations, assert returned IDs are exactly those where `end_time < NOW()` AND `sync_status <> 'complete'` — no more, no less
  - [ ]* 8.3 Write unit tests for `EventFinderService`
    - File: `tests/Feature/PostEventSync/EventFinderServiceTest.php`
    - Test: zero eligible events returns empty array without error
    - Test: `complete` events excluded even when `end_time < NOW()`
    - Test: events with `pending`, `in_progress`, `failed` status all included when `end_time` is in the past
    - _Requirements: 1.5, 1.6_


- [ ] 9. Implement `SyncBackDispatcher`
  - [ ] 9.1 Create `app/Features/PostEventSync/Services/SyncBackDispatcher.php`
    - Constructor: `CheckpointRepository $checkpointRepo`, `PostEventSyncLogger $logger`
    - `dispatch(SyncBatchDTO $batch, string $correlationId): void`
      - Builds C2 payload: `{ event_id, batch_id, records: [...toCheckinRecord()] }`
      - POST to `config('services.checkin.sync_back_url')` with `Authorization: Bearer {CHECKIN_SYNC_BACK_SECRET}`
      - Retry delays `[0, 2, 4, 8]` s (index = attempt 0-based); 429 and 5xx are transient; 4xx (non-429) is permanent; network timeout is transient
      - On 200: call `checkpointRepo->recordBatchSuccess()`, log success
      - On permanent failure: `error_message = "HTTP {status}: " . substr($body, 0, 500)` (500-char cap); call `checkpointRepo->recordFailed()`, call `logger->monitoringAlert()`, throw `PostEventSyncException`
    - `public static function deriveBatchId(string $eventId, int $batchNumber): string` → `hash('sha256', $eventId.':'.$batchNumber)`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.4_
  - [ ]* 9.2 Write property tests for `SyncBackDispatcher` — Properties 4 & 9
    - File: `tests/Property/PostEventSync/SyncBackDispatcherPropertyTest.php`
    - **Property 4: Deterministic Batch ID** — for 100 random `(event_id, batch_number)` pairs, assert same inputs → same output; different pairs → different outputs; **Validates: Requirements 4.2, 9.2**
    - **Property 9: Error Message Shape** — for 100 random HTTP status codes and response bodies of arbitrary length, assert `error_message` contains the status code string and `strlen($message) <= 500`; **Validates: Requirement 7.4**
  - [ ]* 9.3 Write unit tests for `SyncBackDispatcher`
    - File: `tests/Feature/PostEventSync/SyncBackDispatcherTest.php`
    - Test: 200 response calls `recordBatchSuccess` exactly once
    - Test: 500 response retries exactly 3 times before permanent failure
    - Test: 4xx (non-429) treated as permanent failure without any retry
    - Test: 429 response retries up to 3 times (same as 5xx)
    - Test: `recordFailed` called with truncated `error_message` on permanent failure
    - _Requirements: 4.3, 4.4, 4.5, 4.6_


- [ ] 10. Implement `PostEventSyncOrchestrator`
  - [ ] 10.1 Create `app/Features/PostEventSync/Services/PostEventSyncOrchestrator.php`
    - Constructor: `CheckedInAttendeeRepository $attendeeRepo`, `CheckpointRepository $checkpointRepo`, `SyncBackDispatcher $dispatcher`, `PostEventSyncLogger $logger`
    - `run(string $eventId, string $correlationId): void` full pipeline:
      1. `upsertPending($eventId)`
      2. `fetchCheckedIn($eventId)` → `CheckedInAttendeeDTO[]`
      3. If 0 records: `recordComplete($eventId)` and return
      4. `BatchPartitioner::partition($records, 1000)` — call `App\Features\AttendeeSync\Support\BatchPartitioner::partition()` directly, no wrapper
      5. `markInProgress($eventId, count($batches))`
      6. Loop: build `SyncBatchDTO` using `SyncBackDispatcher::deriveBatchId()`, call `dispatcher->dispatch()`
      7. `recordComplete($eventId)`
    - Do NOT catch `PostEventSyncException` — let it propagate to the command
    - _Requirements: 2.3, 3.1, 3.4, 8.1, 8.2, 8.3_
  - [ ]* 10.2 Write property tests for `PostEventSyncOrchestrator` — Properties 8 & 10
    - File: `tests/Property/PostEventSync/PostEventSyncOrchestratorPropertyTest.php`
    - **Property 8: Failure Stops Subsequent Batch Processing** — for 100 random `(total_batches M, fail_at_batch F where F ≤ M)`, assert dispatch called exactly F times, never more; **Validates: Requirement 7.3**
    - **Property 10: Zero-Record Completion** — assert that when `fetchCheckedIn` returns `[]`, `sync_status = complete` and C2 POST count = 0; **Validates: Requirement 2.3**
  - [ ]* 10.3 Write unit tests for `PostEventSyncOrchestrator`
    - File: `tests/Feature/PostEventSync/PostEventSyncOrchestratorTest.php`
    - Test: `upsertPending` called before fetching attendees
    - Test: `markInProgress` called with correct `total_batches = ceil(N/1000)`
    - Test: zero records → `recordComplete` called, zero dispatches
    - Test: `batch_id` derived deterministically for each batch via `deriveBatchId`
    - _Requirements: 2.3, 3.1, 8.1, 8.2_


- [ ] 11. Implement `RetryService`
  - [ ] 11.1 Create `app/Features/PostEventSync/Services/RetryService.php`
    - Constructor: `CheckpointRepository $checkpointRepo`, `CheckedInAttendeeRepository $attendeeRepo`, `SyncBackDispatcher $dispatcher`, `PostEventSyncLogger $logger`
    - `retry(string $eventId, string $correlationId): int`
      1. `find($eventId)` — if null, treat as `pending` and start from batch 1
      2. If `sync_status == 'complete'` → throw `SyncAlreadyCompleteException`
      3. If `sync_status == 'in_progress'` → throw `SyncAlreadyInProgressException`
      4. `markInProgress($eventId, $dto->total_batches)` atomically before first dispatch
      5. Re-fetch all checked-in records, re-partition via `BatchPartitioner::partition($records, 1000)`
      6. Dispatch from `last_successful_batch + 1` through `total_batches` — same `batch_id` values; C2 deduplicates already-applied batches
      7. `recordComplete($eventId)`
      8. Return `$dto->last_successful_batch + 1` as the starting batch number
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
  - [ ]* 11.2 Write property tests for `RetryService` — Properties 6 & 7
    - File: `tests/Property/PostEventSync/RetryServicePropertyTest.php`
    - **Property 6: Retry Resume Correctness** — for 100 random `last_successful_batch = N` (0 ≤ N < total_batches), assert first dispatched `batch_number = N+1`; when N=0, first batch = 1; **Validates: Requirements 6.1, 6.2, 6.3**
    - **Property 7: Retry Idempotency** — for 100 random (N, K) pairs, simulate two sequential retries (resetting status to `failed` between calls), assert final `sync_status = complete` and `last_successful_batch = K` both times; **Validates: Requirement 6.6**
  - [ ]* 11.3 Write unit tests for `RetryService`
    - File: `tests/Feature/PostEventSync/RetryServiceTest.php`
    - Test: `complete` event → `SyncAlreadyCompleteException` thrown, no dispatch
    - Test: `in_progress` event → `SyncAlreadyInProgressException` thrown, no dispatch
    - Test: `failed` with `last_successful_batch = 0` → dispatches from batch 1
    - Test: `failed` with `last_successful_batch = 3` → dispatches from batch 4
    - Test: `markInProgress` called before first dispatch
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.7_


- [ ] 12. Create `PostEventSyncCommand` and register the scheduler
  - [ ] 12.1 Create `app/Features/PostEventSync/Commands/PostEventSyncCommand.php`
    - `protected $signature = 'checkin:post-event-sync'`
    - `protected $description = 'Automatically sync checked-in attendees back to ExplaraX for ended events.'`
    - Constructor: `EventFinderContract $eventFinder`, `PostEventSyncOrchestrator $orchestrator`
    - `handle(): int`
      1. `$correlationId = (string) Str::uuid()`
      2. `$eventIds = $this->eventFinder->findEligible()`
      3. Per-event try/catch `\Throwable`: call `orchestrator->run($eventId, $correlationId)`; on exception log and `continue`
      4. Return `Command::SUCCESS` (0) always — failures are logged, not escalated
    - _Requirements: 1.1, 1.4, 1.5_
  - [ ] 12.2 Register scheduler in `bootstrap/app.php`
    - Add `->withSchedule(function (Schedule $schedule): void { $schedule->command('checkin:post-event-sync')->everyFiveMinutes()->withoutOverlapping(); })` to the application bootstrap chain
    - Import `Illuminate\Console\Scheduling\Schedule`
    - _Requirements: 1.1, 1.4_
  - [ ]* 12.3 Write unit tests for `PostEventSyncCommand`
    - File: `tests/Feature/PostEventSync/PostEventSyncCommandTest.php`
    - Test: exception on event A does not prevent event B from being processed
    - Test: command always returns exit code 0 even when one event throws
    - Test: command registered at 5-minute interval with `withoutOverlapping()`
    - _Requirements: 1.1, 1.4, 1.5_


- [ ] 13. Build the HTTP retry endpoint
  - [ ] 13.1 Create `app/Features/PostEventSync/Http/Requests/RetrySyncRequest.php`
    - Extends `FormRequest`; `authorize()` returns `true` (auth handled by `VerifySharedSecret` middleware)
    - `rules()` returns `[]` (event_id comes from route parameter)
    - _Requirements: 6.4, 6.5_
  - [ ] 13.2 Create `app/Features/PostEventSync/Http/Controllers/RetrySyncController.php`
    - Constructor-injects `RetryService $retryService`
    - `__invoke(RetrySyncRequest $request, string $eventId): JsonResponse`
    - `$correlationId = (string) ($request->attributes->get('request_id') ?? Str::uuid())`
    - Call `$this->retryService->retry($eventId, $correlationId)`
    - Return `200 { event_id, status: 'retry_queued', starting_from_batch: N }`
    - `SyncAlreadyCompleteException` and `SyncAlreadyInProgressException` mapped to 409 via exception handler (do not catch here)
    - _Requirements: 6.4, 6.5_
  - [ ] 13.3 Create `routes/post_event_sync.php`
    - `Route::post('/internal/checkin/retry-sync/{event_id}', RetrySyncController::class)->middleware(VerifySharedSecret::class)`
    - Import `App\Features\SyncBack\Http\Middleware\VerifySharedSecret` — reuse, do not copy
    - _Requirements: 6.1_
  - [ ]* 13.4 Write unit tests for `RetrySyncController`
    - File: `tests/Feature/PostEventSync/RetrySyncControllerTest.php`
    - Test: `complete` event → 409 with `{ "error": "sync_already_complete" }`
    - Test: `in_progress` event → 409 with `{ "error": "sync_already_in_progress" }`
    - Test: `failed` event → 200 with `{ event_id, status: 'retry_queued', starting_from_batch }`
    - Test: request missing valid `CHECKIN_SYNC_BACK_SECRET` → 401
    - _Requirements: 6.4, 6.5_


- [ ] 14. Create `PostEventSyncServiceProvider` and register it
  - [ ] 14.1 Create `app/Providers/PostEventSyncServiceProvider.php`
    - `register()`: bind `CheckedInAttendeeRepository → PostgresCheckedInAttendeeRepository`, `CheckpointRepository → PostgresCheckpointRepository`, `EventFinderContract → EventFinderService`
    - `boot()`: `loadRoutesFrom(base_path('routes/post_event_sync.php'))`, register `PostEventSyncCommand` when `runningInConsole()`, register `ExceptionHandler::renderable()` for both 409 exceptions (`SyncAlreadyCompleteException → 409`, `SyncAlreadyInProgressException → 409`)
    - Follow `AttendeeSyncServiceProvider` pattern exactly
    - _Requirements: all (wiring)_
  - [ ] 14.2 Register provider in `bootstrap/providers.php`
    - Add `App\Providers\PostEventSyncServiceProvider::class` to the returned array — following the same pattern as `AttendeeSyncServiceProvider` and `SyncBackServiceProvider`
    - _Requirements: all (wiring)_

- [ ]* 15. Write property test for `BatchPartitioner` — Property 1
  - File: `tests/Property/PostEventSync/BatchPartitionerPropertyTest.php`
  - **Property 1: BatchPartitioner Round-Trip**
  - **Validates: Requirements 3.2, 3.3, 3.4**
  - For 100 random N (0–5,000): `$records = range(1, $n)`, call `BatchPartitioner::partition($records, 1000)` on `App\Features\AttendeeSync\Support\BatchPartitioner` directly, assert `array_merge(...$batches) == $records`, every non-final batch has exactly 1,000 records, final batch has 1–1,000 records, batch count = `ceil($n / 1000)`
  - N=0 edge case: assert empty array returned immediately


- [ ] 16. Integration tests — end-to-end flows
  - [ ]* 16.1 Write integration test: full automatic sync
    - File: `tests/Feature/PostEventSync/FullSyncIntegrationTest.php`
    - Seed `event_sync_status` as `pending`, mock Supabase `fetchCheckedIn` returning N records, mock C2 returning 200 for all batches, run `PostEventSyncCommand`, assert `sync_status = complete` and `last_successful_batch = ceil(N/1000)`
    - _Requirements: 1.1, 5.2_
  - [ ]* 16.2 Write integration test: partial failure then retry
    - File: `tests/Feature/PostEventSync/RetryIntegrationTest.php`
    - Mock C2 to fail permanently on batch 3, assert `sync_status = failed` and `last_successful_batch = 2`; then POST to `/internal/checkin/retry-sync/{event_id}`, assert `sync_status = complete` and C2 POST count = `total_batches − 2`
    - _Requirements: 6.1, 6.2, 7.3_

- [ ] 17. Final checkpoint — all tests green
  - Run `php artisan test --filter PostEventSync` and confirm zero failures
  - Run `php artisan migrate --pretend` to validate migration SQL output
  - Ensure all tests pass, ask the user if questions arise.


---

## Notes

- Tasks marked with `*` are optional (test sub-tasks) and can be skipped for a faster MVP. Core implementation tasks are never optional.
- All 12 correctness properties have explicit property test sub-tasks: P1 (15), P2 (8.2), P3 (7.2), P4 (9.2), P5 (6.2), P6 (11.2), P7 (11.2), P8 (10.2), P9 (9.2), P10 (10.2), P11 (5.2), P12 (6.2).
- Property tests use a `for ($i = 0; $i < 100; $i++)` loop with Faker-backed generators; tag each with `// Feature: c3-post-event-sync, Property N: <title>`.
- DO NOT touch any file under `app/Features/AttendeeSync/` or `app/Features/SyncBack/`.
- `BatchPartitioner::partition()` is called directly — no wrapper class.
- `VerifySharedSecret` middleware is imported from `App\Features\SyncBack\Http\Middleware\VerifySharedSecret` — reuse, do not copy.
- All checkpoint writes use `DB::statement()` with raw SQL — no Eloquent model for `event_sync_status`.
- Provider is registered in `bootstrap/providers.php` (Laravel 12 — no `config/app.php` providers array).
- Scheduler registered in `bootstrap/app.php` via `->withSchedule()` (Laravel 12 — no `app/Console/Kernel.php`).
- `SUPABASE_RETRY_DELAY=0` in `.env.testing` to eliminate sleep delays in tests.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "4"] },
    { "id": 3, "tasks": ["5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "6.2", "6.3", "7.1", "8.1", "15"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.2", "8.3", "9.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "10.1", "11.1"] },
    { "id": 7, "tasks": ["10.2", "10.3", "11.2", "11.3", "12.1"] },
    { "id": 8, "tasks": ["12.2", "12.3", "13.1", "13.2", "13.3"] },
    { "id": 9, "tasks": ["13.4", "14.1"] },
    { "id": 10, "tasks": ["14.2"] },
    { "id": 11, "tasks": ["16.1", "16.2"] }
  ]
}
```
