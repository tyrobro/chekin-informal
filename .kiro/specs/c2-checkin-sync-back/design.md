# Design Document

## Feature: C2 Check-In Sync-Back Endpoint

---

## Overview

This document describes the technical design for `POST /internal/checkin/sync-back` — the Laravel 12 / PHP 8.4 endpoint that receives check-in records from Supabase and writes them back into ExplaraX core's PostgreSQL database.

The design follows the same conventions established in the `AttendeeSync` feature: thin controller, service layer for orchestration, repository layer for all DB access, DTOs for data contracts, and a dedicated service provider for DI bindings.

---

## Architecture

The feature lives entirely within `app/Features/SyncBack/` following the project's feature-based folder structure.

```
app/Features/SyncBack/
├── Contracts/
│   ├── TicketRepository.php
│   └── SyncErrorRepository.php
├── DTOs/
│   ├── CheckinRecordDTO.php
│   ├── SyncBackRequestDTO.php
│   ├── SyncBackResponseDTO.php
│   └── FailureRecordDTO.php
├── Http/
│   ├── Controllers/
│   │   └── SyncBackController.php
│   ├── Middleware/
│   │   └── VerifySharedSecret.php
│   └── Requests/
│       └── SyncBackRequest.php
├── Repositories/
│   ├── PostgresTicketRepository.php
│   └── PostgresSyncErrorRepository.php
└── Services/
    └── SyncBackService.php

app/Providers/
└── SyncBackServiceProvider.php

config/
└── syncback.php

database/migrations/
├── xxxx_xx_xx_add_checkin_fields_to_tickets_table.php
└── xxxx_xx_xx_create_checkin_sync_errors_table.php

tests/
├── Unit/Features/SyncBack/
│   ├── SyncBackServiceTest.php
│   ├── CheckinRecordDTOTest.php
│   └── SyncBackResponseDTOTest.php
└── Feature/SyncBack/
    ├── SyncBackEndpointTest.php
    ├── SyncBackIdempotencyTest.php
    ├── SyncBackInvalidTicketsTest.php
    └── SyncBackLargeBatchTest.php
```

### Request Lifecycle

```
Supabase POST
  → VerifySharedSecret (middleware: constant-time token check, assign request_id)
  → SyncBackRequest (Laravel Form Request: validates JSON body, returns 422 on failure)
  → SyncBackController (thin: builds DTO, delegates to service, returns JSON)
  → SyncBackService (orchestrates: chunk loop, idempotency check, repo calls, logging)
  → PostgresTicketRepository (bulk SELECT + bulk UPDATE per chunk)
  → PostgresSyncErrorRepository (bulk INSERT per chunk of failures)
  ← SyncBackResponseDTO serialised to JSON 200
```

### Authentication Flow

- `VerifySharedSecret` reads the `Authorization` header.
- Extracts the Bearer token, strips the `Bearer ` prefix.
- Compares with `config('services.checkin_sync_back.secret')` (from `CHECKIN_SYNC_BACK_SECRET` env var) using `hash_equals()` for constant-time comparison.
- Returns HTTP 401 immediately if the header is absent or comparison fails.
- Assigns a `request_id` (from `X-Request-Id` header or generates a UUID v4) and stores it as a request attribute.
- Registered in `bootstrap/app.php` as alias `verify.shared.secret`.

### Route Registration

```php
// routes/api.php
Route::middleware(['verify.shared.secret'])
    ->prefix('internal/checkin')
    ->group(function () {
        Route::post('sync-back', SyncBackController::class)
            ->name('checkin.sync-back');
    });
```

### Configuration

```php
// config/services.php addition
'checkin_sync_back' => [
    'secret' => env('CHECKIN_SYNC_BACK_SECRET'),
],

// config/syncback.php
return [
    'chunk_size' => (int) env('SYNCBACK_CHUNK_SIZE', 500),
];
```

### Idempotency Strategy

The idempotency check is two-layered:

1. **Service layer**: Before issuing a bulk UPDATE, the service compares the incoming `checked_in_at` against the value already in the `tickets` table for each `ticket_id`. If they match, the record is a duplicate and is counted as `succeeded` without any DB write.
2. **DB layer**: `bulkUpdateCheckinFields` uses `AND t.checked_in_at IS NULL` in the WHERE clause. Even if a duplicate slips through, it will not overwrite existing data.

### Performance Strategy

| Concern | Approach |
|---|---|
| Memory for 10K records | Process in Chunks of 500 via `array_chunk()`; never load entire batch at once |
| DB round trips per chunk | 1 bulk SELECT + 1 bulk UPDATE (VALUES list) + 1 bulk INSERT for errors |
| Query plan | `tickets.ticket_id` index (existing); partial index on `checked_in_at IS NOT NULL` |
| Chunk size tuning | Configurable via `SYNCBACK_CHUNK_SIZE` env var (default 500) |
| Estimated 10K throughput | 20 chunks × ~3 queries × ~200ms = ~12s (well under 120s limit) |

---

## Components and Interfaces

### VerifySharedSecret Middleware

Responsibility: Authenticate inbound requests using a shared-secret Bearer token.

```
Input:  HTTP Request with Authorization header
Output: Passes to next middleware, or returns HTTP 401 JSON response
Logic:
  1. Extract Bearer token from Authorization header
  2. hash_equals(config_secret, token) — constant-time comparison
  3. On failure: return {"error": "Unauthorized"} with HTTP 401
  4. On success: set request attribute request_id, call $next($request)
```

### SyncBackRequest (Form Request)

Responsibility: Validate the JSON body before it reaches the controller.

Validation rules:
- `event_id` — `required|string|min:1|max:100`
- `batch_id` — `required|uuid`
- `records` — `required|array|min:1|max:10000`
- `records.*.ticket_id` — `required|string|min:1|max:100`
- `records.*.checked_in_at` — `required|date_format:Y-m-d\TH:i:s\Z`
- `records.*.checked_in_gate` — `required|string|min:1|max:100`
- `records.*.checked_in_by` — `required|string|min:1|max:255`
- `records.*.checkin_method` — `required|string|in:qr_scan,manual,nfc`

### SyncBackController

Responsibility: Receive validated request, build DTO, delegate to service, return response. No business logic.

```
__invoke(SyncBackRequest $request): JsonResponse
  1. $requestId = $request->attributes->get('request_id')
  2. $dto = SyncBackRequestDTO::fromRequest($request, $requestId)
  3. $response = $this->syncBackService->process($dto)
  4. return response()->json($response->toArray(), 200)
```

### SyncBackService

Responsibility: Core orchestration — chunk loop, idempotency detection, repo delegation, logging.

```
process(SyncBackRequestDTO $dto): SyncBackResponseDTO
  1. Initialise SyncBackResponseDTO(batch_id, total)
  2. Log sync_back.batch.started
  3. Chunk $dto->records by chunk_size
  4. Per chunk:
     a. findByTicketIds → $existingMap
     b. Classify each record: not-found / duplicate / to-update
     c. bulkUpdateCheckinFields($toUpdate) → recordSuccess() for each
     d. bulkInsert($errorRows) → recordFailure() for each
  5. Log sync_back.batch.completed with duration_ms
  6. Return SyncBackResponseDTO
```

### TicketRepository (Contract)

```php
interface TicketRepository
{
    // Returns array<string, stdClass{ticket_id, checked_in_at}> keyed by ticket_id
    public function findByTicketIds(array $ticketIds): array;

    // Bulk UPDATE using VALUES list; WHERE checked_in_at IS NULL guard
    public function bulkUpdateCheckinFields(array $records): void;
}
```

### SyncErrorRepository (Contract)

```php
interface SyncErrorRepository
{
    // Single bulk INSERT per chunk of failures
    public function bulkInsert(array $errors): void;
}
```

### PostgresTicketRepository

`findByTicketIds`: `SELECT ticket_id, checked_in_at FROM tickets WHERE ticket_id IN (…)` — returns keyed array.

`bulkUpdateCheckinFields`: PostgreSQL `UPDATE tickets AS t SET … FROM (VALUES …) AS v(…) WHERE t.ticket_id = v.ticket_id AND t.checked_in_at IS NULL` — single statement, wrapped in `DB::transaction()`.

### PostgresSyncErrorRepository

`bulkInsert`: `DB::table('checkin_sync_errors')->insert($errors)` — single INSERT with multiple value rows.

### SyncBackServiceProvider

Registers DI bindings and is listed in `bootstrap/providers.php`:
- `TicketRepository::class` → `PostgresTicketRepository::class`
- `SyncErrorRepository::class` → `PostgresSyncErrorRepository::class`

---

## Data Models

### API Request Shape

```json
{
  "event_id": "TCS-10K-2026",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "records": [
    {
      "ticket_id": "E4CACB-177",
      "checked_in_at": "2026-06-15T09:14:23Z",
      "checked_in_gate": "Gate A",
      "checked_in_by": "staff-uuid",
      "checkin_method": "qr_scan"
    }
  ]
}
```

### API Response Shape

```json
{
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "succeeded": 998,
  "failed": 2,
  "total": 1000,
  "failures": [
    {
      "ticket_id": "BAD-001",
      "reason": "ticket not found in ExplaraX"
    }
  ]
}
```

### CheckinRecordDTO

| Property | Type | Notes |
|---|---|---|
| `ticket_id` | `string` | Readonly |
| `checked_in_at` | `string` | ISO 8601 UTC, kept as string |
| `checked_in_gate` | `string` | Readonly |
| `checked_in_by` | `string` | Readonly |
| `checkin_method` | `string` | Readonly |

Static factory: `fromArray(array $data): self`

### SyncBackRequestDTO

| Property | Type | Notes |
|---|---|---|
| `event_id` | `string` | Readonly |
| `batch_id` | `string` | Readonly |
| `request_id` | `string` | Correlation ID from middleware |
| `records` | `CheckinRecordDTO[]` | Readonly |

Static factory: `fromRequest(SyncBackRequest $request, string $requestId): self`

### SyncBackResponseDTO

| Property | Type | Notes |
|---|---|---|
| `batch_id` | `string` | Set on construction |
| `succeeded` | `int` | Mutable, starts at 0 |
| `failed` | `int` | Mutable, starts at 0 |
| `total` | `int` | Set on construction |
| `failures` | `FailureRecordDTO[]` | Mutable, starts as `[]` |

Methods: `recordSuccess()`, `recordFailure(string $ticket_id, string $reason)`, `toArray(): array`

Invariant: `succeeded + failed === total` (asserted in `toArray()`).

### FailureRecordDTO

| Property | Type |
|---|---|
| `ticket_id` | `string` |
| `reason` | `string` |

Method: `toArray(): array`

### tickets table (modified)

Existing table; four new nullable columns added via migration:

| Column | Type | Nullable | Default |
|---|---|---|---|
| `checked_in_at` | `TIMESTAMPTZ` | YES | `NULL` |
| `checked_in_gate` | `VARCHAR(100)` | YES | `NULL` |
| `checked_in_by` | `VARCHAR(255)` | YES | `NULL` |
| `checkin_method` | `VARCHAR(50)` | YES | `NULL` |

New index: `CREATE INDEX idx_tickets_checked_in_at ON tickets (checked_in_at) WHERE checked_in_at IS NOT NULL`

### checkin_sync_errors table (new)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `BIGSERIAL` | NO | Primary key |
| `event_id` | `VARCHAR(100)` | NO | |
| `ticket_id` | `VARCHAR(100)` | NO | |
| `reason` | `TEXT` | NO | e.g. "ticket not found in ExplaraX" |
| `payload` | `JSONB` | NO | Full CheckinRecord as JSON |
| `created_at` | `TIMESTAMPTZ` | NO | Default `NOW()` |

Indexes: `idx_sync_errors_event_id (event_id)`, `idx_sync_errors_ticket_id (ticket_id)`. Append-only — no `updated_at`.

---

## Error Handling

| Scenario | Layer | Behaviour |
|---|---|---|
| Missing `Authorization` header | `VerifySharedSecret` | Return HTTP 401 `{"error": "Unauthorized"}` |
| Invalid Bearer token | `VerifySharedSecret` | Return HTTP 401 `{"error": "Unauthorized"}` — constant-time comparison prevents timing leakage |
| Request body validation failure | `SyncBackRequest` | Return HTTP 422 with Laravel's structured error body |
| `ticket_id` not found in `tickets` | `SyncBackService` | Continue processing; log to `checkin_sync_errors`; add to `failures` array; increment `failed` count |
| All records invalid | `SyncBackService` | Return HTTP 200 with `succeeded = 0`, `failed = N` |
| All records duplicates | `SyncBackService` | Return HTTP 200 with `succeeded = N`, `failed = 0` — no DB writes |
| DB connection failure | Repository (uncaught) | Propagates to Laravel exception handler → HTTP 500 `{"error": "Internal Server Error"}` — no stack trace exposed |
| Unhandled exception in service | Service (uncaught) | Same as DB connection failure |

Principle: **partial success is not a failure**. The endpoint returns HTTP 200 whenever it completes processing, regardless of how many records failed. HTTP 5xx is strictly for infrastructure failures where no processing occurred.

Logging rules:
- Never log the value of `CHECKIN_SYNC_BACK_SECRET`.
- Never expose raw exception messages or stack traces to the HTTP response body.
- Log `sync_back.record.failed` at WARNING level for each missing ticket_id, with `event_id`, `batch_id`, `ticket_id`, `reason`, `request_id`.

---

## Correctness Properties

These properties hold for any valid authenticated request and describe invariants suitable for property-based testing.

### Property 1: Response Count Invariant

**Validates: Requirements 6.2, 6.3, 6.4**

For any batch of N records, regardless of how many are valid, invalid, or duplicates:

```
response.succeeded + response.failed = response.total
response.total = count(request.records)
response.failures.length = response.failed
```

### Property 2: Idempotency

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

For any valid batch B, calling the endpoint twice with the same payload must produce the same observable state:

```
tickets_state_after_call_1(B) = tickets_state_after_call_2(B)
checkin_sync_errors_count(B) after call_2 = checkin_sync_errors_count(B) after call_1
call_2.response.succeeded + call_2.response.failed = N
call_2.response.failed = 0  (all duplicates counted as succeeded)
```

### Property 3: Error Isolation

**Validates: Requirements 5.1, 5.2, 5.3**

For a batch with M invalid ticket_ids and (N − M) valid ticket_ids:

```
response.succeeded >= (N - M)
response.failed = M
checkin_sync_errors rows for this batch = M
```

Invalid records must never prevent valid records from being updated.

### Property 4: Failure Array Completeness

**Validates: Requirements 6.1, 6.4**

For any response where `failed > 0`:

```
foreach failure in response.failures:
    failure.ticket_id is non-empty string
    failure.reason is non-empty string
count(response.failures) = response.failed
```

### Property 5: Duplicates Are Counted as Succeeded

**Validates: Requirements 4.2, 4.3, 4.4**

For any batch where all N records are duplicates of already-applied data:

```
response.succeeded = N
response.failed = 0
response.failures = []
```

No new rows in `checkin_sync_errors`. No change to any `tickets` row.

---

## Testing Strategy

### Unit Tests (mocked repositories)

Located in `tests/Unit/Features/SyncBack/`.

**SyncBackServiceTest** — covers all classification paths (valid, invalid, duplicate, mixed) using PHPUnit mock objects for repositories. Asserts response DTO invariants directly.

**SyncBackResponseDTOTest** — verifies `recordSuccess()`, `recordFailure()`, `toArray()` shape, and the `succeeded + failed = total` invariant.

**CheckinRecordDTOTest** — verifies `fromArray()` construction and all accepted `checkin_method` values.

### Integration Tests (real database, `RefreshDatabase` trait)

Located in `tests/Feature/SyncBack/`.

**SyncBackEndpointTest** — full HTTP lifecycle: auth failures (401), validation failures (422), successful update (200), correct response shape, DB state after successful call.

**SyncBackIdempotencyTest** — posts the same payload twice; asserts second call returns HTTP 200, all records counted as `succeeded`, no additional `checkin_sync_errors` rows, no change to `tickets` rows.

**SyncBackInvalidTicketsTest** — posts batches with known-bad ticket IDs; asserts `checkin_sync_errors` rows created with correct schema, `failures` array populated, valid records still processed.

**SyncBackLargeBatchTest** *(group: slow)* — seeds 10,000 ticket rows, posts 10,000-record payload, asserts completion within 120 seconds and correct response counts.
