# Implementation Plan: C2 Check-In Sync-Back Endpoint

## Overview

Implement the `POST /internal/checkin/sync-back` endpoint that Supabase calls after a live check-in event to write all collected check-in records back into ExplaraX core's PostgreSQL `tickets` table. The implementation follows the project's Service Layer + Repository Pattern, is idempotent on `(ticket_id, checked_in_at)`, handles missing ticket IDs gracefully, processes batches up to 10,000 records in chunks of 500, and is covered by unit and integration tests.

## Tasks

- [x] 1. Create migration to add check-in fields to the `tickets` table
  - Created `database/migrations/2026_06_04_094940_create_tickets_table.php` (base table)
  - Created `database/migrations/2026_06_10_000001_add_checkin_fields_to_tickets_table.php` (idempotent guard)
  - Columns: `checked_in_at` (TIMESTAMPTZ), `checked_in_gate` (VARCHAR 100), `checked_in_by` (VARCHAR 255), `checkin_method` (VARCHAR 50) — all nullable DEFAULT NULL
  - Partial index: `idx_tickets_checked_in_at ON tickets (checked_in_at) WHERE checked_in_at IS NOT NULL`

- [x] 2. Create migration for the `checkin_sync_errors` table
  - Created `database/migrations/2026_06_10_000002_create_checkin_sync_errors_table.php`
  - Columns: `id` (BIGSERIAL PK), `event_id`, `ticket_id`, `reason`, `payload` (JSONB), `created_at`
  - Indexes: `idx_sync_errors_event_id`, `idx_sync_errors_ticket_id`
  - Append-only — no `updated_at`

- [x] 3. Create `config/syncback.php` configuration file
  - Created `config/syncback.php` with `chunk_size` defaulting to 500
  - Added `SYNCBACK_CHUNK_SIZE=500` and `CHECKIN_SYNC_BACK_SECRET=` to `.env.example`
  - Added `checkin_sync_back.secret` to `config/services.php`
  - Added both env vars to `phpunit.xml`

- [x] 4. Implement `CheckinRecordDTO`
  - Created `app/Features/SyncBack/DTOs/CheckinRecordDTO.php`
  - Readonly properties, `fromArray()` factory, `toArray()` for payload serialisation

- [x] 5. Implement `FailureRecordDTO`
  - Created `app/Features/SyncBack/DTOs/FailureRecordDTO.php`
  - Readonly `ticket_id` and `reason`, `toArray()` method

- [x] 6. Implement `SyncBackResponseDTO`
  - Created `app/Features/SyncBack/DTOs/SyncBackResponseDTO.php`
  - `recordSuccess()`, `recordFailure()`, `toArray()` with `succeeded + failed === total` assertion

- [x] 7. Implement `SyncBackRequestDTO`
  - Created `app/Features/SyncBack/DTOs/SyncBackRequestDTO.php`
  - `fromRequest(SyncBackRequest, string): self` factory

- [x] 8. Define `TicketRepository` contract interface
  - Created `app/Features/SyncBack/Contracts/TicketRepository.php`
  - `findByTicketIds()` and `bulkUpdateCheckinFields()` methods

- [x] 9. Define `SyncErrorRepository` contract interface
  - Created `app/Features/SyncBack/Contracts/SyncErrorRepository.php`
  - `bulkInsert()` method

- [x] 10. Implement `VerifySharedSecret` middleware
  - Created `app/Features/SyncBack/Http/Middleware/VerifySharedSecret.php`
  - `hash_equals()` constant-time comparison, fail-closed, assigns `request_id`

- [x] 11. Register middleware alias in `bootstrap/app.php`
  - Added `verify.shared.secret => VerifySharedSecret::class` alias

- [x] 12. Implement `SyncBackRequest` Form Request
  - Created `app/Features/SyncBack/Http/Requests/SyncBackRequest.php`
  - Full validation rules including ISO 8601 `checked_in_at` and `checkin_method` enum

- [x] 13. Implement `PostgresTicketRepository`
  - Created `app/Features/SyncBack/Repositories/PostgresTicketRepository.php`
  - Bulk SELECT keyed by ticket_id; bulk UPDATE via VALUES list with `AND checked_in_at IS NULL` guard

- [x] 14. Implement `PostgresSyncErrorRepository`
  - Created `app/Features/SyncBack/Repositories/PostgresSyncErrorRepository.php`
  - Single bulk INSERT per chunk

- [x] 15. Implement `SyncBackService`
  - Created `app/Features/SyncBack/Services/SyncBackService.php`
  - Chunk loop, three-way classification (not-found / duplicate / to-update), structured logging
  - `chunkSize` injected as constructor param (no config() call in service — testable without app)

- [x] 16. Implement `SyncBackController`
  - Created `app/Features/SyncBack/Http/Controllers/SyncBackController.php`
  - Thin: extract request_id, build DTO, delegate to service, return JSON

- [x] 17. Register route in `routes/api.php`
  - Added `POST api/internal/checkin/sync-back` with `verify.shared.secret` middleware
  - Verified via `php artisan route:list -v`

- [x] 18. Implement `SyncBackServiceProvider`
  - Created `app/Providers/SyncBackServiceProvider.php`
  - Binds all three: TicketRepository, SyncErrorRepository, SyncBackService (with chunkSize from config)
  - Registered in `bootstrap/providers.php`

- [x] 19. Write unit tests for `SyncBackResponseDTO`
  - Created `tests/Unit/Features/SyncBack/SyncBackResponseDTOTest.php` — 8 tests, all pass

- [x] 20. Write unit tests for `CheckinRecordDTO`
  - Created `tests/Unit/Features/SyncBack/CheckinRecordDTOTest.php` — 6 tests, all pass

- [x] 21. Write unit tests for `SyncBackService`
  - Created `tests/Unit/Features/SyncBack/SyncBackServiceTest.php` — 10 tests, all pass (mocked repos, no DB)

- [x] 22. Write integration tests for the endpoint (auth and validation)
  - Created `tests/Feature/SyncBack/SyncBackEndpointTest.php` — 19 tests, all pass

- [x] 23. Write integration tests for idempotency
  - Created `tests/Feature/SyncBack/SyncBackIdempotencyTest.php` — 6 tests, all pass

- [x] 24. Write integration tests for invalid ticket handling
  - Created `tests/Feature/SyncBack/SyncBackInvalidTicketsTest.php` — 8 tests, all pass

- [x] 25. Write large-batch integration tests
  - Created `tests/Feature/SyncBack/SyncBackLargeBatchTest.php` (`@group slow`)
  - 3 tests: 10K completes in ~52–55s (well under 120s), correct counts, 50 invalid split

- [x] 26. Verify route security and run static analysis
  - `php artisan route:list -v` confirms `verify.shared.secret` on `api/internal/checkin/sync-back`
  - Auth tests confirm 401 for missing/wrong secret

- [x] 27. Run the full test suite for the SyncBack feature
  - `php artisan test --filter=SyncBack --exclude-group=slow` → **58/58 passed** (181 assertions)
  - `php artisan test --group=slow --filter=SyncBackLargeBatchTest` → **3/3 passed** (14 assertions)

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3"], "description": "Database migrations and configuration" },
    { "wave": 2, "tasks": ["4", "5"], "description": "Leaf DTOs" },
    { "wave": 3, "tasks": ["6", "8", "9"], "description": "ResponseDTO and repository contracts" },
    { "wave": 4, "tasks": ["7", "10", "13", "14"], "description": "RequestDTO, Middleware, repository impls" },
    { "wave": 5, "tasks": ["11", "12"], "description": "Middleware alias, FormRequest" },
    { "wave": 6, "tasks": ["15"], "description": "SyncBackService" },
    { "wave": 7, "tasks": ["16"], "description": "SyncBackController" },
    { "wave": 8, "tasks": ["17", "18"], "description": "Route and ServiceProvider" },
    { "wave": 9, "tasks": ["19", "20", "21"], "description": "Unit tests" },
    { "wave": 10, "tasks": ["22", "23", "24", "25"], "description": "Integration tests" },
    { "wave": 11, "tasks": ["26", "27"], "description": "Verification" }
  ]
}
```
