# Implementation Plan: C1 — Attendee Sync (Prepare for Check-in)

## Overview

Implement the attendee sync pipeline on a fresh Laravel 12 project. The plan starts by scaffolding the application, then builds the data layer, queue job, HTTP endpoint, and tests incrementally. Each task references specific requirements and builds on the previous step. No code is left orphaned — every piece is wired together before the task closes.

---

## Tasks

- [x] 1. Scaffold the Laravel 12 application
  - Run `composer create-project laravel/laravel . "^12.0"` inside `/home/ayush/Foundership/ChekInExplara`
  - Set PHP version constraint to `^8.4` in `composer.json`
  - Configure `.env.example` with all required variables: `DB_*` (ExplaraX PostgreSQL), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPLARA_PAYMENTS_URL`, `EXPLARA_API_TOKEN`, `QUEUE_CONNECTION=database`, `SYNC_BATCH_SIZE=1000`
  - Configure `config/logging.php` to use a JSON-structured `daily` channel as the default stack
  - Configure `config/database.php` with `pgsql` as the default connection pointing to ExplaraX core PostgreSQL env vars
  - Set `QUEUE_CONNECTION=database` in `.env.example`; run `php artisan queue:table` and `php artisan migrate`
  - Add `giorgiosironi/eris` via Composer for property-based testing
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Create database migrations for ExplaraX core tables
  - [x] 2.1 Create migration for `event_hmac_keys` table
    - Fields: `id` (bigserial PK), `event_id` (bigint unique not null), `hmac_key` (char(64) not null), `created_at`, `updated_at`
    - Add unique index on `event_id`
    - _Requirements: 5.1, 5.2, 5.4_
  - [x] 2.2 Create migration for `event_preparations` table
    - Fields: `id` (bigserial PK), `event_id` (bigint unique), `sync_id` (uuid), `status` (varchar(20) default 'pending'), `attendee_count` (int nullable), `batch_count` (int nullable), `error_message` (text nullable), `prepared_at` (timestamptz nullable), `created_at`, `updated_at`
    - Add unique index on `event_id`; regular index on `sync_id`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 2.3 Run migrations and verify schema
    - `php artisan migrate`
    - _Requirements: 1.2_

- [x] 3. Define DTOs and core interfaces
  - [x] 3.1 Create `AttendeeDTO` and `AttendeeUpsertDTO`
    - `AttendeeDTO`: `ticket_id`, `event_id`, `attendee_name`, `ticket_type`, `company`, `designation`, `seat`, `metadata` — typed PHP 8.4 readonly class
    - `AttendeeUpsertDTO`: extends `AttendeeDTO` with `qr_token` field
    - Implement a `toUpsertArray()` method on `AttendeeUpsertDTO` that returns only the 9 allowed fields
    - _Requirements: 6.2, 10.1, 10.2_
  - [x] 3.2 Create `PrepareResponseDTO` and `EventPreparationDTO`
    - `PrepareResponseDTO`: `sync_id` (string UUID), `status` (string), `queued_at` (Carbon)
    - `EventPreparationDTO`: `event_id`, `sync_id`, `status`, `prepared_at`, `attendee_count`, `batch_count`, `error_message`
    - _Requirements: 2.6, 8.2_
  - [x] 3.3 Define repository interfaces: `ExplaraXAttendeeRepository`, `HmacKeyRepository`, `EventPreparationRepository`
    - Place interfaces under `app/Features/AttendeeSync/Contracts/`
    - _Requirements: 4.1, 5.1, 8.1_

- [x] 4. Implement `QrTokenService`
  - [x] 4.1 Implement `QrTokenService::sign(string $ticketId, string $hmacKey): string`
    - Use `hash_hmac('sha256', $ticketId, hex2bin($hmacKey))` and return 64-char lowercase hex
    - Place in `app/Features/AttendeeSync/Services/QrTokenService.php`
    - _Requirements: 5.5_
  - [x]* 4.2 Write property test for QR token determinism (Property 5)
    - **Property 5: QR token is deterministic for any (ticket_id, hmac_key) pair**
    - Generate random `ticket_id` strings (any printable string) and random 64-char hex keys
    - Assert `sign($id, $key) === sign($id, $key)` for the same inputs
    - Assert output is always exactly 64 chars matching `[0-9a-f]`
    - **Feature: c1-attendee-sync, Property 5: QR token determinism**
    - **Validates: Requirements 5.5**
  - [x]* 4.3 Write unit test with known HMAC-SHA256 test vectors
    - Test with fixed `ticket_id` and `hmac_key` and verify exact expected output
    - _Requirements: 5.5_

- [x] 5. Implement `HmacKeyRepository`
  - [x] 5.1 Implement `PostgresHmacKeyRepository::getOrCreate(int $eventId): string`
    - Use DB transaction; run `INSERT INTO event_hmac_keys ... ON CONFLICT (event_id) DO NOTHING`
    - If no row was inserted, `SELECT hmac_key FROM event_hmac_keys WHERE event_id = ?`
    - Key generation: `bin2hex(random_bytes(32))`
    - Return the 64-char hex key
    - Bind implementation to interface in `AttendeeSyncServiceProvider`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x]* 5.2 Write property test for HMAC key format (Property 3)
    - **Property 3: HMAC key is always a 64-character lowercase hex string**
    - Call the key generator function (isolated, not the full repo) many times
    - Assert each output is exactly 64 chars and matches `[0-9a-f]+`
    - **Feature: c1-attendee-sync, Property 3: HMAC key format**
    - **Validates: Requirements 5.2, 5.4**
  - [x]* 5.3 Write property test for HMAC key stability (Property 4)
    - **Property 4: HMAC key is stable across repeated calls**
    - Given an event_id with an existing key in a test DB transaction, call `getOrCreate` multiple times
    - Assert all calls return the identical key string
    - **Feature: c1-attendee-sync, Property 4: HMAC key stability**
    - **Validates: Requirements 5.3, 9.4**

- [x] 6. Implement `HttpExplaraXAttendeeRepository`
  - [x] 6.1 Implement `fetchAllForEvent(int $eventId): array`
    - Use Laravel HTTP client with Bearer token from `EXPLARA_API_TOKEN`
    - Call `GET {EXPLARA_PAYMENTS_URL}/api/event/{eventId}/attendees`
    - Handle pagination: loop if response contains a `next_page` / `links.next` key
    - Map each API record to `AttendeeDTO` — explicitly pick only the 6 allowed fields; discard `email`, `phone`, payment fields
    - Throw `ExplaraXApiException` on non-2xx response
    - _Requirements: 4.1, 4.2, 4.4, 4.5_
  - [x]* 6.2 Write property test for PII stripping / batch payload field restriction (Property 2)
    - **Property 2: Batch payload contains only allowed fields and no PII**
    - Generate arbitrary attendee records with random extra fields (`email`, `phone`, `payment_id`, etc.)
    - Pass through the `AttendeeDTO` constructor and `toUpsertArray()` method
    - Assert the resulting array keys exactly equal `['ticket_id','event_id','attendee_name','ticket_type','company','designation','seat','qr_token','metadata']`
    - Assert no key matches a PII pattern
    - **Feature: c1-attendee-sync, Property 2: Batch payload PII stripping**
    - **Validates: Requirements 4.4, 6.2, 10.1, 10.2**
  - [x]* 6.3 Write unit tests for pagination and error handling
    - Mock HTTP responses: paginated two-page response, non-2xx response
    - Assert all attendees collected across pages; assert exception thrown on non-2xx
    - _Requirements: 4.3, 4.5_

- [x] 7. Implement `SupabaseUpsertService`
  - [x] 7.1 Implement `upsertBatch(int $batchNumber, array $rows): void`
    - POST to `{SUPABASE_URL}/rest/v1/attendees?on_conflict=ticket_id`
    - Set headers: `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`, `Prefer: resolution=merge-duplicates`, `Content-Type: application/json`
    - The JSON body must contain only the 9 whitelisted fields (enforced by `AttendeeUpsertDTO::toUpsertArray()`)
    - On non-2xx, retry with exponential backoff: wait `2^(attempt-1) * 2` seconds; max 3 retries
    - Throw `SupabaseBatchException` after exhausting retries
    - _Requirements: 6.1, 6.2, 6.4, 6.5_
  - [x]* 7.2 Write unit tests for retry and backoff logic
    - Mock HTTP client to fail twice then succeed; assert 3 total calls made
    - Mock HTTP client to fail 3 times; assert `SupabaseBatchException` thrown
    - Assert sleep durations are 2s, 4s, 8s
    - _Requirements: 6.5_
  - [x]* 7.3 Write property test for CheckIn fields preservation (Property 7)
    - **Property 7: CheckIn fields are preserved after any upsert**
    - Build a mock Supabase table in-memory (array); populate rows with random `checked_in_at`, `checked_in_gate`, `checked_in_by` values
    - Apply the upsert merge logic from `SupabaseUpsertService` (extracted as pure function for testing)
    - Assert `checked_in_at`, `checked_in_gate`, `checked_in_by` remain unchanged
    - **Feature: c1-attendee-sync, Property 7: CheckIn fields preservation**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 8. Implement batch partitioning logic
  - [x] 8.1 Add `BatchPartitioner::partition(array $attendees, int $batchSize): array` static helper
    - Returns array of arrays; each sub-array has exactly `$batchSize` items except the last
    - Place in `app/Features/AttendeeSync/Support/BatchPartitioner.php`
    - _Requirements: 6.1_
  - [x]* 8.2 Write property test for batch partitioning (Property 6)
    - **Property 6: Batch partitioning is correct for any attendee count**
    - Generate N in range [1, 5000], assert `ceil(N / batchSize)` batches, first `⌊N/batchSize⌋` batches each have exactly `batchSize` rows, last batch has `N mod batchSize` rows (or `batchSize` if divisible)
    - **Feature: c1-attendee-sync, Property 6: Batch partitioning**
    - **Validates: Requirements 6.1**

- [x] 9. Implement `AdvisoryLockService`
  - Implement `tryAcquire(int $lockKey): bool` using `SELECT pg_try_advisory_lock(?)`
  - Implement `release(int $lockKey): void` using `SELECT pg_advisory_unlock(?)`
  - Place in `app/Features/AttendeeSync/Services/AdvisoryLockService.php`
  - _Requirements: 3.1, 3.3, 3.4_

- [x] 10. Implement `SyncLogger`
  - [x] 10.1 Implement `SyncLogger` wrapping Laravel's `Log` facade with bound `sync_id` and `event_id` context
    - Methods: `started()`, `batchCompleted(int $batch, int $count, int $ms)`, `batchRetry(int $batch, int $attempt, string $error)`, `completed(int $total, int $batches, int $ms)`, `failed(int $failedBatch, string $error)`
    - All methods call `Log::channel('daily')->info(...)` with structured JSON context
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  - [x]* 10.2 Write property test for log correlation (Property 11)
    - **Property 11: Every log entry contains sync_id and event_id**
    - Capture log output via Laravel's `Log::fake()`
    - For random `sync_id` / `event_id` pairs, call each `SyncLogger` method
    - Assert every captured log entry contains both fields
    - **Feature: c1-attendee-sync, Property 11: Log correlation**
    - **Validates: Requirements 11.1**

- [x] 11. Implement `EventPreparationRepository`
  - Implement `PostgresEventPreparationRepository::upsert(EventPreparationDTO $dto): void`
  - Use `INSERT INTO event_preparations (...) ON CONFLICT (event_id) DO UPDATE SET ...` inside a DB transaction
  - Bind implementation to interface in `AttendeeSyncServiceProvider`
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 12. Implement `AttendeeSyncJob`
  - [x] 12.1 Implement the full `handle()` method
    - Inject all repository and service dependencies via constructor
    - Step 1: Log `sync.started`
    - Step 2: Call `ExplaraXAttendeeRepository::fetchAllForEvent()` (with retry handling)
    - Step 3: Call `HmacKeyRepository::getOrCreate()`
    - Step 4: For each attendee, call `QrTokenService::sign()` and build `AttendeeUpsertDTO`
    - Step 5: Call `BatchPartitioner::partition()` and loop over batches calling `SupabaseUpsertService::upsertBatch()`; log each batch
    - Step 6: Call `EventPreparationRepository::upsert()` with `status=completed`
    - Step 7: Release advisory lock; log `sync.completed`
    - On any unrecovered exception: upsert `status=failed`, release lock, log `sync.failed`, rethrow
    - _Requirements: 4.1–4.5, 5.1–5.6, 6.1–6.7, 7.1–7.3, 8.1–8.5, 11.2–11.6_
  - [x]* 12.2 Write property test for sync idempotence (Property 9)
    - **Property 9: Sync is idempotent — running twice produces the same state**
    - Use an in-memory Supabase mock; generate random attendee lists; run the upsert pipeline twice
    - Assert the final row set is identical to running it once (same count, same data)
    - **Feature: c1-attendee-sync, Property 9: Sync idempotence**
    - **Validates: Requirements 9.1**
  - [x]* 12.3 Write property test for re-sync additive behaviour (Property 10)
    - **Property 10: Re-sync is additive — new rows inserted, existing rows updated, none deleted**
    - Generate M initial attendees; run sync; add K new attendees; run sync again
    - Assert final row count ≥ M + K; all original M ticket_ids still present; no row deleted
    - **Feature: c1-attendee-sync, Property 10: Re-sync additive**
    - **Validates: Requirements 9.3**
  - [x]* 12.4 Write property test for EventPreparation_Record completeness (Property 8)
    - **Property 8: EventPreparation_Record is complete on successful sync**
    - For any successful sync run (random attendee counts), inspect the written DTO
    - Assert all 6 required fields are non-null: `event_id`, `sync_id`, `status=completed`, `prepared_at`, `attendee_count`, `batch_count`
    - **Feature: c1-attendee-sync, Property 8: EventPreparation record completeness**
    - **Validates: Requirements 8.2**

- [x] 13. Checkpoint — Verify job layer
  - Ensure all tests pass for tasks 4–12, ask the user if questions arise.

- [x] 14. Implement `AttendeeSyncService`
  - Implement `prepare(int $eventId): PrepareResponseDTO`
  - Generate `sync_id` as `Str::uuid()->toString()`
  - Call `AdvisoryLockService::tryAcquire($eventId)`; if fails return early (will be surfaced as 409)
  - Upsert `event_preparations` with `status=in_progress` via `EventPreparationRepository`
  - Dispatch `AttendeeSyncJob::dispatch($eventId, $syncId)->onQueue('attendee-sync')`
  - Return `PrepareResponseDTO`
  - _Requirements: 2.1, 2.6, 2.7, 3.1, 3.2, 3.4_

- [x] 15. Implement `PrepareController`, form request, and route
  - [x] 15.1 Create `PrepareSyncRequest` form request
    - Route model validation: `event_id` must pass `integer|min:1`
    - _Requirements: 2.2, 2.3_
  - [x] 15.2 Create `PrepareController::__invoke(PrepareSyncRequest $request, int $eventId): JsonResponse`
    - Call `AttendeeSyncService::prepare($eventId)`
    - Return `response()->json($dto->toArray(), 202)` on success
    - Return `response()->json(['status' => 'sync_already_in_progress'], 409)` when lock held
    - _Requirements: 2.1, 2.6, 3.2_
  - [x] 15.3 Register route in `routes/api.php`
    - `Route::post('/internal/checkin/prepare/{event_id}', PrepareController::class)`
    - Apply `throttle:10,1` middleware (10 requests / 1 minute)
    - _Requirements: 2.1, 2.4, 2.5_
  - [x] 15.4 Register `AttendeeSyncServiceProvider` and bind all interfaces to implementations
    - Bind in `bootstrap/providers.php`
    - _Requirements: all_
  - [x]* 15.5 Write property test for input validation (Property 1)
    - **Property 1: Input validation rejects invalid event_ids**
    - Generate non-positive integers (0, -1, -999), strings (`"abc"`, `""`), floats, null
    - Assert each yields HTTP 422 with a structured error body containing `errors.event_id`
    - Generate positive integers (1, 99, 999999) and assert they pass validation (no 422)
    - **Feature: c1-attendee-sync, Property 1: Input validation**
    - **Validates: Requirements 2.2, 2.3**

- [x] 16. Integration tests for the HTTP endpoint
  - [x]* 16.1 Write integration test: successful 202 response
    - Mock `AttendeeSyncService`; assert response body contains `sync_id` and `status: "queued"` with HTTP 202
    - _Requirements: 2.6_
  - [x]* 16.2 Write integration test: concurrent 409 response
    - Mock advisory lock as held; assert HTTP 409 with `status: "sync_already_in_progress"`
    - _Requirements: 3.2_
  - [x]* 16.3 Write integration test: rate limit 429 response
    - Fire 11 requests from same IP in quick succession; assert 11th returns HTTP 429
    - _Requirements: 2.4, 2.5_
  - [x]* 16.4 Write integration test: full job with 100 attendees using mocked HTTP
    - Mock ExplaraX API to return 100 attendees; mock Supabase admin API
    - Dispatch and run job synchronously via `Queue::fake()` then manually `handle()`
    - Assert `event_preparations` record written with `status=completed`, `attendee_count=100`, `batch_count=1`
    - _Requirements: 8.2, 12.1_
  - [x]* 16.5 Write integration test: re-sync adds 50 rows without touching existing 9,950
    - Seed Supabase mock with 9,950 rows with check-in data
    - Mock ExplaraX to return 10,000 attendees (50 new ticket_ids)
    - Run sync; assert 50 new rows added, 9,950 existing rows have unchanged `checked_in_at`
    - _Requirements: 7.1, 9.3_

- [x] 17. Final Checkpoint — Full test suite
  - Run `php artisan test --coverage --min=80`
  - Ensure all property tests, unit tests, and integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2.1", "2.2"] },
    { "wave": 3, "tasks": ["2.3"] },
    { "wave": 4, "tasks": ["3.1", "3.2", "3.3"] },
    { "wave": 5, "tasks": ["4.1", "5.1", "6.1", "7.1", "8.1", "9", "10.1"] },
    { "wave": 6, "tasks": ["4.2", "4.3", "5.2", "5.3", "6.2", "6.3", "7.2", "7.3", "8.2", "10.2"] },
    { "wave": 7, "tasks": ["11"] },
    { "wave": 8, "tasks": ["12.1"] },
    { "wave": 9, "tasks": ["12.2", "12.3", "12.4"] },
    { "wave": 10, "tasks": ["13"] },
    { "wave": 11, "tasks": ["14"] },
    { "wave": 12, "tasks": ["15.1", "15.2", "15.3", "15.4"] },
    { "wave": 13, "tasks": ["15.5"] },
    { "wave": 14, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5"] },
    { "wave": 15, "tasks": ["17"] }
  ]
}
```

```
1 (Scaffold Laravel)
└── 2 (Migrations)
    ├── 2.1 (event_hmac_keys)
    ├── 2.2 (event_preparations)
    └── 2.3 (Run migrations)
        └── 3 (DTOs & Interfaces)
            ├── 3.1 (AttendeeDTO / AttendeeUpsertDTO)
            ├── 3.2 (PrepareResponseDTO / EventPreparationDTO)
            └── 3.3 (Repository interfaces)
                ├── 4 (QrTokenService)
                │   ├── 4.1 (Implement sign())
                │   ├── 4.2* (Property test P5)
                │   └── 4.3* (Unit test vectors)
                ├── 5 (HmacKeyRepository)
                │   ├── 5.1 (PostgresHmacKeyRepository)
                │   ├── 5.2* (Property test P3)
                │   └── 5.3* (Property test P4)
                ├── 6 (HttpExplaraXAttendeeRepository)
                │   ├── 6.1 (fetchAllForEvent)
                │   ├── 6.2* (Property test P2)
                │   └── 6.3* (Unit tests pagination)
                ├── 7 (SupabaseUpsertService)
                │   ├── 7.1 (upsertBatch)
                │   ├── 7.2* (Unit tests retry)
                │   └── 7.3* (Property test P7)
                ├── 8 (BatchPartitioner)
                │   ├── 8.1 (partition())
                │   └── 8.2* (Property test P6)
                ├── 9 (AdvisoryLockService)
                └── 10 (SyncLogger)
                    ├── 10.1 (Implement SyncLogger)
                    └── 10.2* (Property test P11)
                        └── 11 (EventPreparationRepository)
                            └── 12 (AttendeeSyncJob)
                                ├── 12.1 (Implement handle())
                                ├── 12.2* (Property test P9)
                                ├── 12.3* (Property test P10)
                                └── 12.4* (Property test P8)
                                    └── 13 (Checkpoint — job layer)
                                        └── 14 (AttendeeSyncService)
                                            └── 15 (PrepareController + route)
                                                ├── 15.1 (PrepareSyncRequest)
                                                ├── 15.2 (PrepareController)
                                                ├── 15.3 (Route registration)
                                                ├── 15.4 (ServiceProvider bindings)
                                                └── 15.5* (Property test P1)
                                                    └── 16 (Integration tests)
                                                        ├── 16.1* (202 response)
                                                        ├── 16.2* (409 concurrent)
                                                        ├── 16.3* (429 rate limit)
                                                        ├── 16.4* (Full job 100 attendees)
                                                        └── 16.5* (Re-sync 50 new rows)
                                                            └── 17 (Final checkpoint)
```

**Critical path (required, non-optional):**
`1 → 2 → 3 → {4.1, 5.1, 6.1, 7.1, 8.1, 9, 10.1} → 11 → 12.1 → 13 → 14 → 15 → 17`

Tasks marked `*` are optional property/unit/integration tests. All required tasks must be completed in the order shown by the critical path; optional test tasks can run in parallel with their sibling implementation task.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but are strongly recommended for a production-grade pipeline.
- Each task references specific requirements for traceability.
- Property tests use `giorgiosironi/eris` for PHPUnit-native generators; minimum 100 iterations per property.
- All Supabase interactions use the service-role key from environment variables only — never from code.
- The HMAC key must never appear in any log, response body, or test assertion output.
- Advisory lock integer key: use `event_id` directly as the `int8` lock key for `pg_try_advisory_lock`.
