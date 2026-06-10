# Implementation Plan: C2 — Sync-Back (Check-In to ExplaraX Core)

## Overview

Implement the sync-back pipeline that receives post-event check-in records from Supabase and writes them into the ExplaraX core `tickets` table. The feature follows the same Service Layer / Repository / DTO / thin-controller pattern established in C1 (AttendeeSync) and lives in `App\Features\SyncBack\`.

All tasks are PHP 8.4 with `declare(strict_types=1)`. The property-based test library is `giorgiosironi/eris`.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1", "1.2"] },
    { "wave": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "wave": 3, "tasks": ["3.1", "3.2", "3.3"] },
    { "wave": 4, "tasks": ["4.1", "4.3", "4.4", "5"] },
    { "wave": 5, "tasks": ["4.2", "5.1", "6.1"] },
    { "wave": 6, "tasks": ["6.2", "6.3"] },
    { "wave": 7, "tasks": ["6.4", "6.5", "6.6", "6.7", "6.8"] },
    { "wave": 8, "tasks": ["7.1", "7.3", "7.4"] },
    { "wave": 9, "tasks": ["7.2", "8"] },
    { "wave": 10, "tasks": ["9"] },
    { "wave": 11, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6"] }
  ]
}
```

---

## Tasks

- [x] 1. Create database migrations
  - [x] 1.1 Create migration for `checkin_sync_errors` table
    - New file: `database/migrations/YYYY_MM_DD_HHMMSS_create_checkin_sync_errors_table.php`
    - Columns: `id` (bigserial pk), `event_id` (text not null), `ticket_id` (text not null), `reason` (text not null), `payload` (jsonb not null default `{}`), `created_at` (timestamptz not null default now())
    - Add indexes on `event_id` and `ticket_id`
    - _Requirements: 5.1, 5.3_

  - [x] 1.2 Create migration for `checkin_sync_batches` table
    - New file: `database/migrations/YYYY_MM_DD_HHMMSS_create_checkin_sync_batches_table.php`
    - Columns: `id` (bigserial pk), `batch_id` (uuid not null unique), `event_id` (text not null), `total` (integer not null), `succeeded` (integer not null), `failed` (integer not null), `response_payload` (jsonb not null default `{}`), `processed_at` (timestamptz not null default now())
    - Add unique index on `batch_id`; regular index on `event_id`
    - The `response_payload` column stores the full serialised `SyncBackResponseDTO::toArray()` for exact replay on duplicate `batch_id` requests
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.3 Create migration for `tickets` table
    - New file: `database/migrations/YYYY_MM_DD_HHMMSS_create_tickets_table.php`
    - This is the ExplaraX core `tickets` table. In production it is pre-existing; this migration creates it for the local development and test environment.
    - Minimum columns required by C2: `id` (bigserial pk), `ticket_id` (text not null unique), `event_id` (text not null), `checked_in_at` (timestamptz nullable), `checked_in_gate` (text nullable), `checked_in_by` (text nullable), `checkin_method` (text nullable), `created_at` (timestamptz not null default now()), `updated_at` (timestamptz not null default now())
    - Add unique index on `ticket_id`; regular index on `event_id`
    - _Requirements: 4.2, 4.3, 10.1_

- [x] 2. Create DTOs
  - [x] 2.1 Create `CheckInRecordDTO`
    - File: `app/Features/SyncBack/DTOs/CheckInRecordDTO.php`
    - PHP 8.4 readonly class with `declare(strict_types=1)`
    - Constructor fields: `ticket_id: string`, `checked_in_at: string`, `checked_in_gate: string`, `checked_in_by: string`, `checkin_method: string`
    - Static factory `fromArray(array $data): self` — explicitly maps only the five allowed keys; any extra keys are discarded
    - _Requirements: 3.4, 3.5, 3.6, 10.3_

  - [x] 2.2 Create `SyncBackRequestDTO`
    - File: `app/Features/SyncBack/DTOs/SyncBackRequestDTO.php`
    - PHP 8.4 readonly class
    - Constructor fields: `event_id: string`, `batch_id: string`, `records: array` (typed as `CheckInRecordDTO[]` in docblock)
    - Static factory `fromRequest(SyncBackRequest $request): self`
    - _Requirements: 1.1, 3.1, 3.2, 3.3_

  - [x] 2.3 Create `SyncBackResponseDTO`
    - File: `app/Features/SyncBack/DTOs/SyncBackResponseDTO.php`
    - PHP 8.4 readonly class
    - Constructor fields: `batch_id: string`, `succeeded: int`, `failed: int`, `failures: array` (typed as `FailureDTO[]`)
    - `toArray(): array` method for JSON serialisation
    - _Requirements: 7.1_

  - [x] 2.4 Create `FailureDTO`
    - File: `app/Features/SyncBack/DTOs/FailureDTO.php`
    - PHP 8.4 readonly class
    - Constructor fields: `ticket_id: string`, `reason: string`
    - `toArray(): array` method
    - _Requirements: 7.1, 5.5_

  - [x] 2.5 Create `BulkUpdateResultDTO`
    - File: `app/Features/SyncBack/DTOs/BulkUpdateResultDTO.php`
    - PHP 8.4 readonly class
    - Constructor fields: `succeeded: array` (ticket_id strings), `notFound: array` (ticket_id strings)
    - _Requirements: 4.2, 5.1_

  - [x] 2.6 Create `CheckinSyncErrorDTO`
    - File: `app/Features/SyncBack/DTOs/CheckinSyncErrorDTO.php`
    - PHP 8.4 readonly class
    - Constructor fields: `event_id: string`, `ticket_id: string`, `reason: string`, `payload: array`, `created_at: string`
    - Static factory `fromRecord(string $eventId, CheckInRecordDTO $record, string $reason): self`
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 2.7 Create `SyncBatchDTO`
    - File: `app/Features/SyncBack/DTOs/SyncBatchDTO.php`
    - PHP 8.4 readonly class
    - Constructor fields: `batch_id: string`, `event_id: string`, `total: int`, `succeeded: int`, `failed: int`, `response_payload: array`, `processed_at: string`
    - `response_payload` stores the full `SyncBackResponseDTO::toArray()` result for exact replay
    - Static factory `fromResponse(SyncBackResponseDTO $dto, string $eventId, int $total): self`
    - _Requirements: 6.2, 6.3_

- [x] 3. Create repository contracts
  - [x] 3.1 Create `TicketUpdateRepository` interface
    - File: `app/Features/SyncBack/Contracts/TicketUpdateRepository.php`
    - Method: `bulkUpdate(array $records): BulkUpdateResultDTO` where `$records` is `CheckInRecordDTO[]`
    - _Requirements: 4.2, 4.3, 10.1_

  - [x] 3.2 Create `CheckinSyncErrorRepository` interface
    - File: `app/Features/SyncBack/Contracts/CheckinSyncErrorRepository.php`
    - Method: `insertMany(array $errors): void` where `$errors` is `CheckinSyncErrorDTO[]`
    - _Requirements: 5.1_

  - [x] 3.3 Create `SyncBatchRepository` interface
    - File: `app/Features/SyncBack/Contracts/SyncBatchRepository.php`
    - Methods: `findByBatchId(string $batchId): ?SyncBatchDTO` and `insert(SyncBatchDTO $dto): void`
    - `findByBatchId` must return the full `SyncBatchDTO` including `response_payload` so the caller can reconstruct the exact original response for replay
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. Implement repositories
  - [x] 4.1 Implement `PostgresTicketUpdateRepository`
    - File: `app/Features/SyncBack/Repositories/PostgresTicketUpdateRepository.php`
    - `bulkUpdate(array $records): BulkUpdateResultDTO`:
      - Create a temporary table for the chunk: `CREATE TEMP TABLE tmp_sync_back_chunk (ticket_id TEXT, checked_in_at TIMESTAMPTZ, checked_in_gate TEXT, checked_in_by TEXT, checkin_method TEXT) ON COMMIT DROP`
      - Insert all records into the temp table with a single multi-value `INSERT`
      - Execute a single `UPDATE tickets SET checked_in_at = t.checked_in_at, checked_in_gate = t.checked_in_gate, checked_in_by = t.checked_in_by, checkin_method = t.checkin_method FROM tmp_sync_back_chunk t WHERE tickets.ticket_id = t.ticket_id RETURNING tickets.ticket_id`
      - Compute `notFound` as the set difference between submitted ticket_ids and returned updated ticket_ids
      - Wrap entire operation in `DB::transaction()`
    - Column list is hardcoded — never derived from input
    - _Requirements: 4.2, 4.3, 4.4, 8.3, 10.1, 10.2_

  - [x]* 4.2 Write unit tests for `PostgresTicketUpdateRepository`
    - Use SQLite in-memory database seeded with a `tickets` table
    - Test: all matching ticket_ids are updated with correct values
    - Test: `notFound` contains all ticket_ids not in the DB
    - Test: no columns other than the four check-in fields are modified
    - Test: wraps in transaction (rollback on exception)
    - _Requirements: 4.3, 10.1_

  - [x] 4.3 Implement `PostgresCheckinSyncErrorRepository`
    - File: `app/Features/SyncBack/Repositories/PostgresCheckinSyncErrorRepository.php`
    - `insertMany(array $errors): void`:
      - Build a single multi-value `INSERT INTO checkin_sync_errors (event_id, ticket_id, reason, payload, created_at) VALUES (...), (...)`
      - Wrap in `DB::transaction()`
      - If `$errors` is empty, return immediately without executing SQL
    - _Requirements: 5.1, 5.3_

  - [x] 4.4 Implement `PostgresSyncBatchRepository`
    - File: `app/Features/SyncBack/Repositories/PostgresSyncBatchRepository.php`
    - `findByBatchId(string $batchId): ?SyncBatchDTO`: `SELECT batch_id, event_id, total, succeeded, failed, response_payload, processed_at FROM checkin_sync_batches WHERE batch_id = ? LIMIT 1`
    - `insert(SyncBatchDTO $dto): void`: `INSERT INTO checkin_sync_batches (batch_id, event_id, total, succeeded, failed, response_payload, processed_at) VALUES (...) ON CONFLICT (batch_id) DO NOTHING` wrapped in transaction
    - Cast `response_payload` from JSONB to array on read
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 5. Create `SyncBackLogger`
  - File: `app/Features/SyncBack/Services/SyncBackLogger.php`
  - Mirrors `SyncLogger` from C1 (`App\Features\AttendeeSync\Services\SyncLogger`) exactly, adapting to sync-back events
  - Constructor: `__construct(string $batchId, string $eventId, string $requestId)`
  - **Instantiated directly inside `SyncBackService::process()` after auth passes — NOT injected via the service container.**
  - Methods:
    - `started(int $recordCount): void` → emits `sync_back.started` with `record_count`
    - `chunkCompleted(int $chunkNumber, int $succeeded, int $failed, int $durationMs): void` → emits `sync_back.chunk_completed`
    - `recordFailed(string $ticketId, string $reason): void` → emits `sync_back.record_failed`; no PII beyond `ticket_id`
    - `completed(int $total, int $succeeded, int $failed, int $durationMs): void` → emits `sync_back.completed`
  - Private `log(string $event, array $context): void` merges `['batch_id', 'event_id', 'request_id']` into every entry and calls `Log::channel('json_daily')->info()`
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x]* 5.1 Write unit tests for `SyncBackLogger`
    - Mock `Log::channel('json_daily')` using Laravel's `Log::spy()`
    - Assert each method emits the correct event name
    - Assert every log entry contains `batch_id`, `event_id`, `request_id`
    - Assert `recordFailed` does NOT include any field other than `ticket_id` and `reason`
    - _Requirements: 9.1, 9.5_

- [x] 6. Implement `SyncBackService`
  - [x] 6.1 Reuse `BatchPartitioner` from C1
    - **Do NOT create a new `ChunkPartitioner`.** Reference `App\Features\AttendeeSync\Support\BatchPartitioner::partition()` directly from `SyncBackService`.
    - No new file needed. This task is a spec note only — verify `BatchPartitioner` exists at `app/Features/AttendeeSync/Support/BatchPartitioner.php` and has the `partition(array $items, int $batchSize): array` signature.
    - The chunk size comes from `config('syncback.chunk_size', 500)`
    - _Requirements: 4.1, 8.4_

  - [x] 6.2 Implement `SyncBackService`
    - File: `app/Features/SyncBack/Services/SyncBackService.php`
    - Constructor receives: `TicketUpdateRepository`, `CheckinSyncErrorRepository`, `SyncBatchRepository`
    - **`SyncBackLogger` is NOT injected.** It is instantiated inside `process()` after `batch_id`, `event_id`, and `request_id` are known.
    - Method: `process(SyncBackRequestDTO $dto, string $bearerToken, string $requestId): ?SyncBackResponseDTO`
      - Step 1 — Auth: `hash_equals(config('syncback.secret', ''), $bearerToken)` → return `null` on mismatch (controller maps to 401)
      - Step 2 — Idempotency: `SyncBatchRepository::findByBatchId($dto->batch_id)` → if found, reconstruct `SyncBackResponseDTO` from `response_payload` and return immediately
      - Step 3 — Instantiate `SyncBackLogger($dto->batch_id, $dto->event_id, $requestId)`
      - Step 4 — Log `sync_back.started`
      - Step 5 — Split `$dto->records` via `BatchPartitioner::partition(..., config('syncback.chunk_size', 500))`
      - Step 6 — Loop over chunks: `TicketUpdateRepository::bulkUpdate(chunk)`, accumulate succeeded/failed, `CheckinSyncErrorRepository::insertMany` for notFound, log `recordFailed` per missing, log `chunkCompleted`
      - Step 7 — Build `SyncBackResponseDTO`
      - Step 8 — `SyncBatchRepository::insert(SyncBatchDTO::fromResponse($response, $dto->event_id, count($dto->records)))`
      - Step 9 — Log `sync_back.completed`
      - Return `SyncBackResponseDTO`
    - _Requirements: 1.2, 2.1, 2.2, 4.1–4.6, 5.1–5.5, 6.1–6.5, 7.1–7.5_

  - [x]* 6.3 Write property test for auth token rejection
    - **Property 1: Auth rejects any token that is not SYNC_BACK_SECRET**
    - **Validates: Requirements 1.2, 1.3, 2.2, 2.3, 2.4**
    - Using `giorgiosironi/eris`: generate random strings that are not equal to `SYNC_BACK_SECRET`
    - Assert: `SyncBackService::process(...)` returns `null` for every generated token
    - Assert: no DB writes occur (repositories are mocked and `bulkUpdate` is never called)
    - Tag: `Feature: c2-sync-back, Property 1: auth rejects invalid tokens`

  - [x]* 6.4 Write property test for response counts accuracy
    - **Property 5: succeeded + failed == total records**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5**
    - Using `giorgiosironi/eris`: generate arrays of N records (1–500) with random mix of valid and invalid ticket_ids
    - Mock `TicketUpdateRepository` to return a deterministic split based on generated data
    - Assert: `response->succeeded + response->failed === N` for every generated input
    - Assert: `count(response->failures) === response->failed`
    - Tag: `Feature: c2-sync-back, Property 5: response counts accuracy`

  - [x]* 6.5 Write property test for batch idempotency
    - **Property 6: Processing same batch_id twice produces identical responses**
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5**
    - Generate random valid request DTOs; process each once to get `response1`
    - Seed `SyncBatchRepository` mock to return the stored DTO (with `response_payload`) on second call
    - Process the same DTO again to get `response2`
    - Assert: `response1->toArray() === response2->toArray()` (exact payload match from stored JSONB)
    - Assert: `TicketUpdateRepository::bulkUpdate` is called 0 times on second invocation
    - Tag: `Feature: c2-sync-back, Property 6: batch idempotency`

  - [x]* 6.6 Write property test for missing ticket logging
    - **Property 4: Missing ticket_id is always logged to checkin_sync_errors**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Generate arrays where a random subset of ticket_ids are marked as notFound by the mocked repository
    - Assert: `CheckinSyncErrorRepository::insertMany` is called with exactly those notFound ticket_ids
    - Assert: every inserted error has `reason === "ticket not found in ExplaraX"` and non-empty `payload`
    - Tag: `Feature: c2-sync-back, Property 4: missing ticket logging`

  - [x]* 6.7 Write property test for field restriction
    - **Property 3: Only four check-in columns written to tickets**
    - **Validates: Requirements 4.3, 4.4, 10.1, 10.2, 10.3**
    - Generate `CheckInRecordDTO` arrays that include random extra keys (injected via reflection or by constructing raw arrays)
    - Use a test-double `TicketUpdateRepository` that captures the records passed to `bulkUpdate`
    - Assert: every record passed to `bulkUpdate` contains only `ticket_id`, `checked_in_at`, `checked_in_gate`, `checked_in_by`, `checkin_method`
    - Assert: no extra keys are present
    - Tag: `Feature: c2-sync-back, Property 3: field restriction`

- [x] 7. Create HTTP layer
  - [x] 7.1 Create `SyncBackRequest` form request
    - File: `app/Features/SyncBack/Http/Requests/SyncBackRequest.php`
    - `authorize(): bool` returns `true` (auth handled in service via Bearer token)
    - `rules(): array`:
      - `event_id`: required, string
      - `batch_id`: required, uuid
      - `records`: required, array, min:1
      - `records.*.ticket_id`: required, string
      - `records.*.checked_in_at`: required, date (ISO 8601)
      - `records.*.checked_in_gate`: required, string
      - `records.*.checked_in_by`: required, string
      - `records.*.checkin_method`: required, string
    - Returns HTTP 422 automatically via Laravel FormRequest on failure
    - _Requirements: 1.4, 1.5, 3.1–3.7_

  - [x]* 7.2 Write property test for input validation rejection
    - **Property 2: Input validation rejects any payload with missing or malformed fields**
    - **Validates: Requirements 1.4, 1.5, 3.1–3.7**
    - Using `giorgiosironi/eris`: generate request bodies with random combinations of missing/null/wrong-type fields
    - Assert: `SyncBackRequest` validation fails for every generated invalid payload
    - Assert: no DB writes occur when validation fails
    - Tag: `Feature: c2-sync-back, Property 2: input validation rejection`

  - [x] 7.3 Create `SyncBackController`
    - File: `app/Features/SyncBack/Http/Controllers/SyncBackController.php`
    - Thin controller following `PrepareController` pattern from C1
    - `__invoke(SyncBackRequest $request): JsonResponse`
      - Build `SyncBackRequestDTO` from validated request
      - Extract Bearer token: `$request->bearerToken() ?? ''`
      - Generate `request_id`: `(string) $request->header('X-Request-Id', Str::uuid()->toString())`
      - Call `SyncBackService::process($dto, $bearerToken, $requestId)`
      - If `null` returned: `response()->json(['message' => 'Unauthorized'], 401)`
      - Otherwise: `response()->json($responseDto->toArray(), 200)`
    - _Requirements: 1.2, 1.3, 1.6, 7.1_

  - [x] 7.4 Register route
    - Add to `routes/api.php` (or a dedicated `routes/internal.php` loaded by the service provider):
      `Route::post('/internal/checkin/sync-back', SyncBackController::class)`
    - No additional middleware beyond what is applied to the internal group (IP allowlist if applicable)
    - _Requirements: 1.1_

- [x] 8. Create service provider and wire everything together
  - File: `app/Providers/SyncBackServiceProvider.php`
  - Mirrors `AttendeeSyncServiceProvider` from C1
  - `register()`:
    - Bind `TicketUpdateRepository::class` → `PostgresTicketUpdateRepository::class`
    - Bind `CheckinSyncErrorRepository::class` → `PostgresCheckinSyncErrorRepository::class`
    - Bind `SyncBatchRepository::class` → `PostgresSyncBatchRepository::class`
    - **Do NOT bind `SyncBackLogger` in the container.** It is instantiated inside `SyncBackService::process()`.
  - `boot()`: load the route if `routes/api.php` does not already register it
  - Register provider in `bootstrap/providers.php`
  - Add config file: `config/syncback.php` with keys `secret` (from `SYNC_BACK_SECRET`) and `chunk_size` (from `SYNC_BACK_CHUNK_SIZE`, default 500)
  - Add `SYNC_BACK_SECRET=` and `SYNC_BACK_CHUNK_SIZE=500` to `.env.example`
  - _Requirements: 2.1, 4.1, 8.4_

- [x] 9. Checkpoint — Ensure all tests pass
  - Run `php artisan test` and verify zero failures
  - Run `php artisan migrate` against the test database and confirm both new tables are created
  - Verify property tests execute with ≥ 100 iterations each
  - Ask the user if any questions arise before proceeding

- [x]* 10. Write integration tests
  - [x]* 10.1 Integration test: happy path — all tickets valid
    - `POST /internal/checkin/sync-back` with valid Bearer token, 10 records all matching real `tickets` rows
    - Assert: HTTP 200, `succeeded=10`, `failed=0`, `failures=[]`
    - Assert: `tickets` rows have updated check-in fields
    - _Requirements: 1.6, 4.2, 7.1_

  - [x]* 10.2 Integration test: invalid Bearer token returns 401
    - `POST /internal/checkin/sync-back` with wrong Bearer token
    - Assert: HTTP 401
    - Assert: no rows written to any table
    - _Requirements: 1.3, 2.4_

  - [x]* 10.3 Integration test: 50 invalid ticket_ids in 10,000 records
    - Seed `tickets` table with 9,950 rows; send 10,000 records where 50 have unknown `ticket_id`
    - Assert: HTTP 200, `succeeded=9950`, `failed=50`
    - Assert: `failures` array contains exactly the 50 missing ticket_ids
    - Assert: `checkin_sync_errors` has exactly 50 new rows
    - _Requirements: 5.1–5.5_

  - [x]* 10.4 Integration test: same batch_id twice (idempotency)
    - Send the same valid payload twice with the same `batch_id`
    - Assert: both calls return HTTP 200 with identical response bodies
    - Assert: `checkin_sync_batches` has exactly 1 row for the `batch_id`
    - Assert: `tickets` rows are not double-updated
    - _Requirements: 6.1–6.5_

  - [x]* 10.5 Integration test: missing required field returns 422
    - Send payload without `records` field
    - Assert: HTTP 422 with validation error body referencing `records`
    - _Requirements: 1.4, 3.3_

  - [x]* 10.6 Integration test: log correlation — every log entry contains batch_id and event_id
    - **Property 8: Every log entry contains batch_id, event_id, and request_id**
    - **Validates: Requirements 9.1–9.6**
    - Process a valid batch; capture all log output
    - Assert: every log line (parsed as JSON) contains non-null `batch_id`, `event_id`, `request_id`
    - Tag: `Feature: c2-sync-back, Property 8: log correlation`

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP build
- All core implementation tasks (unmarked) must be completed before the feature is considered done
- Each task references specific requirements for full traceability
- Follow the exact DTO, repository, service, and controller patterns from `App\Features\AttendeeSync` (C1)
- The `SyncBackLogger` is a near-direct copy of `SyncLogger` — only the field names and event strings differ
- `ChunkPartitioner` is a near-direct copy of `BatchPartitioner` — same logic, different namespace
- All migrations must be reversible (implement `down()` method)
- Environment variables `SYNC_BACK_SECRET` and `SYNC_BACK_CHUNK_SIZE` must be added to `.env.example`
