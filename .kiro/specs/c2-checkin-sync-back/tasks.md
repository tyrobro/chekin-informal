# Implementation Plan: C2 Check-In Sync-Back Endpoint

## Overview

Implement the `POST /internal/checkin/sync-back` endpoint that Supabase calls after a live check-in event to write all collected check-in records back into ExplaraX core's PostgreSQL `tickets` table. The implementation follows the project's Service Layer + Repository Pattern, is idempotent on `(ticket_id, checked_in_at)`, handles missing ticket IDs gracefully, processes batches up to 10,000 records in chunks of 500, and is covered by unit and integration tests.

## Tasks

- [ ] 1. Create migration to add check-in fields to the `tickets` table
  - Create `database/migrations/xxxx_xx_xx_add_checkin_fields_to_tickets_table.php`
  - Add four nullable columns: `checked_in_at` (TIMESTAMPTZ), `checked_in_gate` (VARCHAR 100), `checked_in_by` (VARCHAR 255), `checkin_method` (VARCHAR 50) — all `DEFAULT NULL`
  - Add partial index: `CREATE INDEX idx_tickets_checked_in_at ON tickets (checked_in_at) WHERE checked_in_at IS NOT NULL`
  - `down()` drops the index then drops all four columns
  - Verify: `php artisan migrate` and `php artisan migrate:rollback` run without error

- [ ] 2. Create migration for the `checkin_sync_errors` table
  - Create `database/migrations/xxxx_xx_xx_create_checkin_sync_errors_table.php`
  - Columns: `id` (BIGSERIAL PK), `event_id` (VARCHAR 100 NOT NULL), `ticket_id` (VARCHAR 100 NOT NULL), `reason` (TEXT NOT NULL), `payload` (JSONB NOT NULL), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  - Indexes: `idx_sync_errors_event_id (event_id)`, `idx_sync_errors_ticket_id (ticket_id)`
  - No `updated_at` — rows are append-only
  - `down()` drops the table
  - Verify: migration and rollback run cleanly

- [ ] 3. Create `config/syncback.php` configuration file
  - Return `['chunk_size' => (int) env('SYNCBACK_CHUNK_SIZE', 500)]`
  - Add `SYNCBACK_CHUNK_SIZE=500` to `.env.example`
  - Add `CHECKIN_SYNC_BACK_SECRET=` to `.env.example`
  - Add `'checkin_sync_back' => ['secret' => env('CHECKIN_SYNC_BACK_SECRET')]` to `config/services.php`

- [ ] 4. Implement `CheckinRecordDTO`
  - File: `app/Features/SyncBack/DTOs/CheckinRecordDTO.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\DTOs`
  - Readonly constructor properties: `string $ticket_id`, `string $checked_in_at`, `string $checked_in_gate`, `string $checked_in_by`, `string $checkin_method`
  - Static factory `fromArray(array $data): self`

- [ ] 5. Implement `FailureRecordDTO`
  - File: `app/Features/SyncBack/DTOs/FailureRecordDTO.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\DTOs`
  - Readonly constructor properties: `string $ticket_id`, `string $reason`
  - Method `toArray(): array` returning `['ticket_id' => ..., 'reason' => ...]`

- [ ] 6. Implement `SyncBackResponseDTO`
  - File: `app/Features/SyncBack/DTOs/SyncBackResponseDTO.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\DTOs`
  - Constructor sets `string $batch_id` and `int $total`; initialises `int $succeeded = 0`, `int $failed = 0`, `array $failures = []`
  - `recordSuccess(): void` — increments `$succeeded`
  - `recordFailure(string $ticket_id, string $reason): void` — increments `$failed`, appends new `FailureRecordDTO`
  - `toArray(): array` — returns full response shape with keys `batch_id`, `succeeded`, `failed`, `total`, `failures`; enforces `succeeded + failed === total` via assertion

- [ ] 7. Implement `SyncBackRequestDTO`
  - File: `app/Features/SyncBack/DTOs/SyncBackRequestDTO.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\DTOs`
  - Readonly constructor properties: `string $event_id`, `string $batch_id`, `string $request_id`, `array $records` (docblock: `CheckinRecordDTO[]`)
  - Static factory `fromRequest(SyncBackRequest $request, string $requestId): self` — calls `CheckinRecordDTO::fromArray()` for each record in `$request->validated('records')`

- [ ] 8. Define `TicketRepository` contract interface
  - File: `app/Features/SyncBack/Contracts/TicketRepository.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\Contracts`
  - Method 1: `findByTicketIds(array $ticketIds): array` — PHPDoc `@param string[] $ticketIds`, `@return array<string, \stdClass>`
  - Method 2: `bulkUpdateCheckinFields(array $records): void` — PHPDoc `@param CheckinRecordDTO[] $records`

- [ ] 9. Define `SyncErrorRepository` contract interface
  - File: `app/Features/SyncBack/Contracts/SyncErrorRepository.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\Contracts`
  - Method: `bulkInsert(array $errors): void` — PHPDoc `@param array<array{event_id: string, ticket_id: string, reason: string, payload: string, created_at: string}> $errors`

- [ ] 10. Implement `VerifySharedSecret` middleware
  - File: `app/Features/SyncBack/Http/Middleware/VerifySharedSecret.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\Http\Middleware`
  - `handle(Request $request, Closure $next): Response`
  - Extract Bearer token from `Authorization` header; return HTTP 401 `{"error": "Unauthorized"}` if absent or empty
  - Read `config('services.checkin_sync_back.secret')`; return 401 if config value is empty (fail-closed)
  - Use `hash_equals((string) $configSecret, $token)` for constant-time comparison; return 401 on mismatch
  - Resolve `request_id` from `X-Request-Id` header or generate `(string) Str::uuid()`; store via `$request->attributes->set('request_id', $requestId)`
  - Call `$next($request)` on success
  - Never log the secret value

- [ ] 11. Register middleware alias in `bootstrap/app.php`
  - In the `withMiddleware` closure, add alias: `'verify.shared.secret' => VerifySharedSecret::class`
  - Verify existing `AttendeeSync` aliases (if any) are preserved

- [ ] 12. Implement `SyncBackRequest` Form Request
  - File: `app/Features/SyncBack/Http/Requests/SyncBackRequest.php`
  - Extends `Illuminate\Foundation\Http\FormRequest`
  - `authorize(): bool` returns `true`
  - `rules(): array` with all field rules as specified in the design document (event_id, batch_id, records array, all record subfields including `checkin_method` enum)

- [ ] 13. Implement `PostgresTicketRepository`
  - File: `app/Features/SyncBack/Repositories/PostgresTicketRepository.php`
  - Implements `TicketRepository` contract
  - `findByTicketIds(array $ticketIds): array`: guard empty array → return `[]`; execute `SELECT ticket_id, checked_in_at FROM tickets WHERE ticket_id IN (…)` with parameter binding; return `array<string, stdClass>` keyed by `ticket_id`
  - `bulkUpdateCheckinFields(array $records): void`: guard empty array → return; build parameterised `UPDATE tickets AS t SET checked_in_at = v.checked_in_at::timestamptz, checked_in_gate = v.checked_in_gate, checked_in_by = v.checked_in_by, checkin_method = v.checkin_method, updated_at = NOW() FROM (VALUES …) AS v(ticket_id, checked_in_at, checked_in_gate, checked_in_by, checkin_method) WHERE t.ticket_id = v.ticket_id AND t.checked_in_at IS NULL`; wrap in `DB::transaction()`; use `DB::statement()` with flattened bindings array

- [ ] 14. Implement `PostgresSyncErrorRepository`
  - File: `app/Features/SyncBack/Repositories/PostgresSyncErrorRepository.php`
  - Implements `SyncErrorRepository` contract
  - `bulkInsert(array $errors): void`: guard empty array → return; each row has keys `event_id`, `ticket_id`, `reason`, `payload` (JSON-encoded CheckinRecord), `created_at` (UTC string); use `DB::table('checkin_sync_errors')->insert($errors)`

- [ ] 15. Implement `SyncBackService`
  - File: `app/Features/SyncBack/Services/SyncBackService.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\Services`
  - Constructor injects `TicketRepository $ticketRepo`, `SyncErrorRepository $syncErrorRepo`, `\Psr\Log\LoggerInterface $logger`
  - `process(SyncBackRequestDTO $dto): SyncBackResponseDTO`:
    1. Record `$startTime = microtime(true)`
    2. Initialise `SyncBackResponseDTO($dto->batch_id, count($dto->records))`
    3. Log `sync_back.batch.started` (info) with `event_id`, `batch_id`, `total_records`, `request_id`
    4. Chunk `$dto->records` using `array_chunk()` and `config('syncback.chunk_size', 500)`
    5. Per chunk: call `findByTicketIds` → classify each record as not-found / duplicate / to-update → `bulkUpdateCheckinFields($toUpdate)` → `recordSuccess()` per updated → log `sync_back.record.failed` (warning) and accumulate `$errorRows` for not-found records → `recordFailure()` per not-found → `bulkInsert($errorRows)`
    6. Log `sync_back.batch.completed` (info) with `event_id`, `batch_id`, `succeeded`, `failed`, `duration_ms`, `request_id`
    7. Return `SyncBackResponseDTO`

- [ ] 16. Implement `SyncBackController`
  - File: `app/Features/SyncBack/Http/Controllers/SyncBackController.php`
  - `declare(strict_types=1)`, namespace `App\Features\SyncBack\Http\Controllers`
  - Extends `Illuminate\Routing\Controller`
  - Constructor injects `SyncBackService $syncBackService`
  - `__invoke(SyncBackRequest $request): JsonResponse`:
    1. `$requestId = $request->attributes->get('request_id', (string) Str::uuid())`
    2. `$dto = SyncBackRequestDTO::fromRequest($request, $requestId)`
    3. `$response = $this->syncBackService->process($dto)`
    4. `return response()->json($response->toArray(), 200)`
  - No try/catch, no conditional logic beyond the four steps above

- [ ] 17. Register route in `routes/api.php`
  - Add `Route::middleware(['verify.shared.secret'])->prefix('internal/checkin')->group(fn () => Route::post('sync-back', SyncBackController::class)->name('checkin.sync-back'))`
  - Verify `php artisan route:list` shows the route with `verify.shared.secret` middleware

- [ ] 18. Implement `SyncBackServiceProvider`
  - File: `app/Providers/SyncBackServiceProvider.php`
  - `declare(strict_types=1)`, namespace `App\Providers`
  - Extends `Illuminate\Support\ServiceProvider`
  - `register(): void` binds `TicketRepository::class → PostgresTicketRepository::class` and `SyncErrorRepository::class → PostgresSyncErrorRepository::class`
  - Register in `bootstrap/providers.php`

- [ ] 19. Write unit tests for `SyncBackResponseDTO`
  - File: `tests/Unit/Features/SyncBack/SyncBackResponseDTOTest.php`
  - `test_initial_state_is_zero_counts()` — new DTO has `succeeded = 0`, `failed = 0`, `failures = []`
  - `test_record_success_increments_succeeded()` — call `recordSuccess()` N times, assert `succeeded = N`
  - `test_record_failure_increments_failed_and_appends_failure()` — call `recordFailure('T1', 'reason')`, assert `failed = 1` and `failures[0]` shape
  - `test_to_array_matches_contract_shape()` — assert all keys present: `batch_id`, `succeeded`, `failed`, `total`, `failures`
  - `test_failures_array_length_equals_failed_count()` — add 3 failures, assert `count(failures) = 3`
  - `test_succeeded_plus_failed_equals_total_invariant()` — after N successes and M failures, assert `succeeded + failed = N + M = total`

- [ ] 20. Write unit tests for `CheckinRecordDTO`
  - File: `tests/Unit/Features/SyncBack/CheckinRecordDTOTest.php`
  - `test_from_array_sets_all_properties_correctly()` — assert all five properties match input
  - `test_all_checkin_methods_accepted()` — data provider for `qr_scan`, `manual`, `nfc`

- [ ] 21. Write unit tests for `SyncBackService`
  - File: `tests/Unit/Features/SyncBack/SyncBackServiceTest.php`
  - Use PHPUnit mock objects for `TicketRepository` and `SyncErrorRepository`
  - `test_all_valid_records_returns_all_succeeded()` — mock repo returns all IDs found; assert `succeeded = N`, `failed = 0`
  - `test_all_invalid_records_returns_all_failed()` — mock repo returns empty map; assert `succeeded = 0`, `failed = N`
  - `test_mixed_batch_returns_correct_split()` — 7 valid, 3 invalid; assert `succeeded = 7`, `failed = 3`
  - `test_duplicate_records_counted_as_succeeded_not_failed()` — mock returns tickets with matching `checked_in_at`; assert all counted as `succeeded`
  - `test_duplicate_records_do_not_trigger_bulk_update()` — assert `bulkUpdateCheckinFields` is never called when all records are duplicates
  - `test_invalid_tickets_trigger_bulk_error_insert()` — assert `bulkInsert` called with correct row shape
  - `test_valid_records_trigger_bulk_update()` — assert `bulkUpdateCheckinFields` called with correct DTOs
  - `test_response_invariant_succeeded_plus_failed_equals_total()` — assert invariant for arbitrary inputs
  - `test_failures_array_length_equals_failed_count()` — assert `count(failures) = failed`

- [ ] 22. Write integration tests for the endpoint (auth and validation)
  - File: `tests/Feature/SyncBack/SyncBackEndpointTest.php`
  - Use `RefreshDatabase` trait; seed known `tickets` rows
  - `test_missing_auth_header_returns_401()`
  - `test_wrong_secret_returns_401()`
  - `test_missing_event_id_returns_422()`
  - `test_invalid_batch_id_returns_422()`
  - `test_empty_records_array_returns_422()`
  - `test_invalid_checkin_method_returns_422()`
  - `test_valid_request_returns_200()`
  - `test_valid_request_response_has_correct_shape()` — assert keys `batch_id`, `succeeded`, `failed`, `total`, `failures`
  - `test_valid_request_updates_ticket_checked_in_at()`
  - `test_valid_request_updates_ticket_checked_in_gate()`
  - `test_total_equals_records_count()`
  - `test_succeeded_plus_failed_equals_total()`

- [ ] 23. Write integration tests for idempotency
  - File: `tests/Feature/SyncBack/SyncBackIdempotencyTest.php`
  - Use `RefreshDatabase` trait
  - `test_second_call_with_same_payload_returns_200()`
  - `test_second_call_succeeded_count_equals_total()` — all duplicates counted as `succeeded`, `failed = 0`
  - `test_second_call_does_not_change_ticket_checked_in_at()`
  - `test_second_call_does_not_insert_into_checkin_sync_errors()`
  - `test_all_duplicate_batch_has_zero_failed()`
  - `test_partial_duplicate_batch_skips_duplicates_updates_new()`

- [ ] 24. Write integration tests for invalid ticket handling
  - File: `tests/Feature/SyncBack/SyncBackInvalidTicketsTest.php`
  - Use `RefreshDatabase` trait
  - `test_single_invalid_ticket_returns_one_failed()`
  - `test_invalid_ticket_creates_row_in_checkin_sync_errors()`
  - `test_sync_errors_row_has_correct_fields()` — assert `event_id`, `ticket_id`, `reason`, `payload`, `created_at` present
  - `test_50_invalid_out_of_100_returns_50_failed_and_50_succeeded()`
  - `test_invalid_tickets_do_not_stop_valid_tickets_from_processing()`
  - `test_all_invalid_returns_zero_succeeded_and_200_status()`
  - `test_failures_array_contains_entry_for_each_invalid_ticket()`

- [ ] 25. Write large-batch integration tests
  - File: `tests/Feature/SyncBack/SyncBackLargeBatchTest.php`
  - Mark class with `@group slow`
  - `test_10000_records_completes_within_120_seconds()` — seed 10,000 tickets; assert HTTP 200 returned; assert elapsed time < 120s
  - `test_10000_records_correct_counts_in_response()` — same setup; assert `succeeded + failed = 10000`

- [ ] 26. Verify route security and run static analysis
  - Confirm `php artisan route:list` shows `verify.shared.secret` on the sync-back route
  - Confirm a request without auth header returns 401 (covered by integration test)
  - Run `./vendor/bin/phpstan analyse app/Features/SyncBack app/Providers/SyncBackServiceProvider.php` at the project's configured level; resolve all errors

- [ ] 27. Run the full test suite for the SyncBack feature
  - Execute `php artisan test --filter=SyncBack` (excludes slow group) — all tests must pass
  - Execute `php artisan test --group=slow --filter=SyncBackLargeBatchTest` — large-batch tests must pass within time limit
  - Confirm test coverage for `SyncBackService` and `SyncBackResponseDTO` is ≥ 90%

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2", "3"],
      "description": "Database migrations and configuration — no code dependencies"
    },
    {
      "wave": 2,
      "tasks": ["4", "5"],
      "description": "Leaf DTOs (CheckinRecordDTO, FailureRecordDTO) — no internal dependencies"
    },
    {
      "wave": 3,
      "tasks": ["6", "8", "9"],
      "description": "ResponseDTO and repository contracts — depend on wave 2 DTOs"
    },
    {
      "wave": 4,
      "tasks": ["7", "10", "13", "14"],
      "description": "RequestDTO (needs CheckinRecordDTO), Middleware, and repository implementations (need contracts)"
    },
    {
      "wave": 5,
      "tasks": ["11", "12"],
      "description": "Middleware alias registration (needs middleware), FormRequest"
    },
    {
      "wave": 6,
      "tasks": ["15"],
      "description": "SyncBackService — depends on all DTOs, contracts, and FormRequest"
    },
    {
      "wave": 7,
      "tasks": ["16"],
      "description": "SyncBackController — depends on service and RequestDTO"
    },
    {
      "wave": 8,
      "tasks": ["17", "18"],
      "description": "Route registration and ServiceProvider — depend on controller and middleware alias"
    },
    {
      "wave": 9,
      "tasks": ["19", "20", "21"],
      "description": "Unit tests — can be written once wave 6 (service) and wave 3 (DTOs) are complete"
    },
    {
      "wave": 10,
      "tasks": ["22", "23", "24", "25"],
      "description": "Integration tests — depend on migrations (1, 2), full stack (waves 1–8)"
    },
    {
      "wave": 11,
      "tasks": ["26", "27"],
      "description": "Static analysis and full test run — final verification"
    }
  ]
}
```

## Notes

- All files under `app/Features/SyncBack/` must begin with `declare(strict_types=1);`.
- The idempotency guard in `PostgresTicketRepository::bulkUpdateCheckinFields` (`AND t.checked_in_at IS NULL`) is the authoritative DB-level safety net; the service-level check is an optimisation to reduce unnecessary UPDATE calls.
- `checkin_sync_errors` rows are never deleted or updated — they are an immutable audit log.
- The large-batch test (Task 25) requires a properly seeded test database. Use a factory or a database seeder dedicated to this test class. Mark the class `@group slow` so it is excluded from normal `php artisan test` runs.
- Never add a `select *` query anywhere in this feature — always specify columns explicitly per project standards.
- The `payload` column in `checkin_sync_errors` stores `json_encode($record->toArray())` of the failed `CheckinRecordDTO`.
