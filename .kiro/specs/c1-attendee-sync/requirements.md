# Requirements Document

## Introduction

C1 — Attendee Sync is the preparation step that copies an event's full attendee roster from the ExplaraX payments service into the Supabase check-in store before an event goes live. A host triggers the sync via `POST /internal/checkin/prepare/{event_id}`. The sync must be fast enough to handle 10,000+ attendees, idempotent so it is safe to re-run, and privacy-preserving so no email, phone, or payment data ever reaches the check-in store.

This feature is the foundational data pipeline for the entire check-in product. All downstream check-in operations depend on attendee records being present and correct in Supabase.

## Glossary

- **AttendeeSync_Service**: The Laravel service class responsible for orchestrating the full sync workflow.
- **AttendeeSyncJob**: The Laravel queue job that performs batched Supabase upserts.
- **ExplaraX_API**: The ExplaraX payments REST API (`https://payments.explarax.com/api`) that provides attendee data.
- **Supabase_AdminAPI**: The Supabase service-role REST API used to upsert attendee rows into the check-in store.
- **HMAC_KeyStore**: The ExplaraX core PostgreSQL table that stores per-event HMAC signing keys.
- **EventPreparation_Record**: The ExplaraX core PostgreSQL row written when a sync completes successfully, marking the event as "prepared".
- **QR_Token**: An HMAC-SHA256 signed string derived from `ticket_id` and the per-event HMAC key, used for QR code check-in.
- **Batch**: A slice of up to 1,000 attendee records sent in a single Supabase upsert request.
- **CheckIn_Fields**: Read-only fields managed by the check-in system (`checked_in_at`, `checked_in_gate`, `checked_in_by`). These must never be overwritten by a sync.
- **Idempotent_Upsert**: A database write that produces the same final state regardless of how many times it is applied.
- **Advisory_Lock**: A PostgreSQL application-level lock used to prevent concurrent sync jobs for the same event.
- **Prepare_Endpoint**: `POST /internal/checkin/prepare/{event_id}` — the HTTP entry point for this feature.
- **SyncStatus**: An enum stored in the EventPreparation_Record: `pending`, `in_progress`, `completed`, `failed`.

---

## Requirements

### Requirement 1: Laravel Project Scaffolding

**User Story:** As a developer, I want a fully scaffolded Laravel 12 project so that I have a working foundation before implementing any feature code.

#### Acceptance Criteria

1. THE AttendeeSync_Service project SHALL be built on Laravel 12 with PHP 8.4.
2. THE project SHALL include a PostgreSQL database connection configured via environment variables for ExplaraX core.
3. THE project SHALL include a Supabase connection configured via environment variables using the service-role key.
4. THE project SHALL include Laravel Queues configured to use the `database` driver by default, with Redis as a future-ready alternative.
5. THE project SHALL include a structured JSON logging configuration using Laravel's built-in logging channels.
6. THE project SHALL include a `.env.example` file listing all required environment variables without secret values.

---

### Requirement 2: Prepare Endpoint

**User Story:** As a host, I want to trigger attendee sync by calling a single endpoint so that my event is ready for check-in without manual intervention.

#### Acceptance Criteria

1. THE Prepare_Endpoint SHALL accept `POST /internal/checkin/prepare/{event_id}` requests.
2. WHEN the Prepare_Endpoint is invoked, THE AttendeeSync_Service SHALL validate that `event_id` is a positive integer.
3. IF `event_id` is missing or not a positive integer, THEN THE Prepare_Endpoint SHALL return HTTP 422 with a structured error body.
4. THE Prepare_Endpoint SHALL be protected by rate limiting to a maximum of 10 requests per minute per calling IP.
5. IF the rate limit is exceeded, THEN THE Prepare_Endpoint SHALL return HTTP 429.
6. THE Prepare_Endpoint SHALL return HTTP 202 with a `sync_id` and `status: "queued"` immediately after dispatching the AttendeeSyncJob to the queue.
7. THE Prepare_Endpoint SHALL never block the HTTP response waiting for the sync to complete.

---

### Requirement 3: Concurrency Guard

**User Story:** As Cloud Infra, I want the sync system to prevent duplicate concurrent runs so that parallel triggers do not corrupt the attendee store.

#### Acceptance Criteria

1. WHEN the Prepare_Endpoint is invoked, THE AttendeeSync_Service SHALL acquire a PostgreSQL Advisory_Lock scoped to `event_id` before dispatching work.
2. IF an Advisory_Lock for the same `event_id` is already held, THEN THE Prepare_Endpoint SHALL return HTTP 409 with `status: "sync_already_in_progress"`.
3. THE Advisory_Lock SHALL be released automatically when the AttendeeSyncJob completes or fails.
4. THE Advisory_Lock timeout SHALL be set to 0 (non-blocking) so the second invocation returns immediately rather than waiting.

---

### Requirement 4: Attendee Fetch from ExplaraX

**User Story:** As a host, I want the sync to pull the most current attendee data from ExplaraX so that late registrations are included.

#### Acceptance Criteria

1. WHEN the AttendeeSyncJob runs, THE AttendeeSync_Service SHALL query the ExplaraX_API at `GET https://payments.explarax.com/api/event/{event_id}/attendees` using a Bearer token stored in environment variables.
2. THE AttendeeSync_Service SHALL retrieve attendee records containing at minimum: `ticket_id`, `attendee_name`, `ticket_type`, `company`, `designation`, `seat`.
3. IF the ExplaraX_API returns a non-2xx response, THEN THE AttendeeSync_Service SHALL retry the request with exponential backoff up to 3 times before marking the sync as failed.
4. THE AttendeeSync_Service SHALL never log or persist `email`, `phone`, or payment-related fields received from ExplaraX_API.
5. WHEN the ExplaraX_API response is paginated, THE AttendeeSync_Service SHALL fetch all pages before beginning the upsert phase.

---

### Requirement 5: HMAC Key Management

**User Story:** As Cloud Infra, I want each event to have a stable HMAC signing key so that QR tokens remain valid across re-syncs.

#### Acceptance Criteria

1. WHEN the AttendeeSyncJob starts, THE AttendeeSync_Service SHALL check the HMAC_KeyStore for an existing key for `event_id`.
2. IF no key exists, THEN THE AttendeeSync_Service SHALL generate a cryptographically random 256-bit HMAC key and persist it to the HMAC_KeyStore within a database transaction.
3. IF a key already exists, THEN THE AttendeeSync_Service SHALL reuse the existing key without modification.
4. THE HMAC key generation SHALL use PHP's `random_bytes(32)` encoded as a 64-character lowercase hexadecimal string.
5. THE AttendeeSync_Service SHALL compute `qr_token` for each attendee as `HMAC-SHA256(ticket_id, event_hmac_key)` encoded as a 64-character lowercase hexadecimal string.
6. THE HMAC key SHALL never be included in any API response, log entry, or Supabase payload.

---

### Requirement 6: Supabase Batch Upsert

**User Story:** As a host, I want attendees written to the check-in store in safe batches so that a large event does not time out or overwhelm the system.

#### Acceptance Criteria

1. THE AttendeeSync_Service SHALL split attendees into Batches of exactly 1,000 records, with the final batch containing the remainder.
2. WHEN a Batch is sent to the Supabase_AdminAPI, THE payload SHALL contain only these fields: `ticket_id`, `event_id`, `attendee_name`, `ticket_type`, `company`, `designation`, `seat`, `qr_token`, `metadata`.
3. THE Supabase upsert SHALL use `ticket_id` as the conflict key so that duplicate inserts update existing rows.
4. WHEN performing a Batch upsert, THE Supabase_AdminAPI call SHALL use an `ON CONFLICT (ticket_id) DO UPDATE` strategy that excludes `checked_in_at`, `checked_in_gate`, and `checked_in_by` from the update set.
5. IF a Batch request fails, THEN THE AttendeeSync_Service SHALL retry that Batch with exponential backoff: 2s, 4s, 8s, up to 3 retries before marking the entire sync as failed.
6. WHEN all Batches succeed, THE AttendeeSync_Service SHALL proceed to write the EventPreparation_Record.
7. THE AttendeeSync_Service SHALL log the batch number, record count, and duration for each Batch using structured JSON logging.

---

### Requirement 7: CheckIn Fields Preservation

**User Story:** As Cloud Infra, I want a re-sync to refresh attendee metadata without overwriting any check-in state so that re-running the sync mid-event is safe.

#### Acceptance Criteria

1. WHEN a Batch upsert updates an existing attendee row, THE Supabase_AdminAPI SHALL preserve the existing values of `checked_in_at`, `checked_in_gate`, and `checked_in_by`.
2. THE upsert SQL strategy SHALL explicitly list only the fields to be updated and SHALL NOT include CheckIn_Fields in the `DO UPDATE SET` clause.
3. FOR ALL attendee records already present in Supabase before a re-sync, the values of `checked_in_at`, `checked_in_gate`, and `checked_in_by` SHALL be identical after the re-sync.

---

### Requirement 8: EventPreparation Record

**User Story:** As a host, I want to know when the sync has finished so that I can open check-in gates with confidence.

#### Acceptance Criteria

1. WHEN all Batches complete successfully, THE AttendeeSync_Service SHALL write an EventPreparation_Record to ExplaraX core PostgreSQL within a database transaction.
2. THE EventPreparation_Record SHALL contain: `event_id`, `sync_id`, `status` (set to `completed`), `prepared_at` (UTC timestamp), `attendee_count`, `batch_count`.
3. IF an EventPreparation_Record for the same `event_id` already exists, THE AttendeeSync_Service SHALL upsert it using `event_id` as the conflict key.
4. WHEN the AttendeeSyncJob fails after exhausting retries, THE AttendeeSync_Service SHALL upsert the EventPreparation_Record with `status: "failed"` and an `error_message` field.
5. THE EventPreparation_Record write SHALL use a database transaction; if the transaction fails, THE AttendeeSync_Service SHALL log the failure with structured JSON and surface an alert.

---

### Requirement 9: Idempotency

**User Story:** As Cloud Infra, I want repeated sync invocations to produce the same final state so that infra-level retries or manual re-runs never cause data corruption.

#### Acceptance Criteria

1. FOR ALL attendee records, running the full sync twice in succession SHALL produce the same set of rows in Supabase as running it once.
2. THE AttendeeSync_Service SHALL generate the same `qr_token` for the same `ticket_id` across multiple sync runs for the same event.
3. WHEN the sync is re-run after new tickets are sold, THE Supabase_AdminAPI upsert SHALL insert new attendee rows and update metadata of existing rows without deleting any rows.
4. THE HMAC key for a given `event_id` SHALL remain unchanged across sync re-runs once it has been generated.

---

### Requirement 10: Privacy and Data Minimisation

**User Story:** As Cloud Infra, I want the check-in store to contain no PII beyond what is needed for check-in so that attendee data is protected.

#### Acceptance Criteria

1. THE Batch payload sent to Supabase_AdminAPI SHALL never contain `email`, `phone`, national ID numbers, or payment-related fields.
2. THE AttendeeSync_Service SHALL strip all fields not in the allowed list (`ticket_id`, `event_id`, `attendee_name`, `ticket_type`, `company`, `designation`, `seat`, `qr_token`, `metadata`) before constructing any Batch.
3. THE structured logs written by AttendeeSync_Service SHALL never contain individual attendee `email`, `phone`, or payment fields.
4. THE HMAC key SHALL never appear in any log, API response, or error message.

---

### Requirement 11: Structured Logging and Observability

**User Story:** As Cloud Infra, I want every sync operation to produce structured logs with correlation IDs so that I can trace failures across distributed components.

#### Acceptance Criteria

1. THE AttendeeSync_Service SHALL include a `sync_id` (UUID v4) and `event_id` in every log entry it writes.
2. WHEN a sync starts, THE AttendeeSync_Service SHALL log a `sync.started` event with `event_id`, `sync_id`, and `queued_at`.
3. WHEN each Batch completes, THE AttendeeSync_Service SHALL log a `batch.completed` event with `batch_number`, `record_count`, and `duration_ms`.
4. WHEN a Batch retry is attempted, THE AttendeeSync_Service SHALL log a `batch.retry` event with `batch_number`, `attempt_number`, and `error_message`.
5. WHEN the sync completes, THE AttendeeSync_Service SHALL log a `sync.completed` event with `event_id`, `sync_id`, `total_attendees`, `total_batches`, and `duration_ms`.
6. WHEN the sync fails, THE AttendeeSync_Service SHALL log a `sync.failed` event with `event_id`, `sync_id`, `failed_batch`, and `error_message`.
7. ALL log entries SHALL use structured JSON format and SHALL include a UTC timestamp.

---

### Requirement 12: Performance

**User Story:** As a host, I want the sync to complete quickly so that I can prepare an event close to its start time without anxiety.

#### Acceptance Criteria

1. WHEN syncing up to 100 attendees, THE AttendeeSyncJob SHALL complete within 30 seconds.
2. WHEN syncing up to 10,000 attendees, THE AttendeeSyncJob SHALL complete within 5 minutes.
3. THE AttendeeSync_Service SHALL process Batches sequentially within a single job to avoid Supabase rate limiting, unless a parallel strategy is explicitly enabled via configuration.
4. THE Prepare_Endpoint SHALL return HTTP 202 within 500ms of receiving the request, regardless of attendee count.
