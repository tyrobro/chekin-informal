# Requirements Document

## Introduction

Slice C2 of the ExplaraX Check-In system introduces the **Sync-Back Endpoint**: a synchronous, authenticated HTTP endpoint that Supabase calls after a live check-in event concludes. Its purpose is to write all check-in records collected by Supabase back into ExplaraX core's PostgreSQL `tickets` table, making attendance data available for host dashboards, reporting, and auditing.

The endpoint must be idempotent, resilient to invalid ticket references, performant at 10,000 records per batch, and must never partially-corrupt the `tickets` table. It is an internal endpoint — not public-facing — and is protected by a shared-secret Bearer token.

---

## Glossary

- **SyncBack_Endpoint**: The POST `/internal/checkin/sync-back` HTTP endpoint defined in this slice.
- **SyncBack_Service**: The Laravel service class that orchestrates record processing, idempotency checks, ticket updates, and error logging.
- **Ticket_Repository**: The repository responsible for all read and write access to the `tickets` table in ExplaraX core's PostgreSQL database.
- **SyncError_Repository**: The repository responsible for all write access to the `checkin_sync_errors` table.
- **CheckinRecord**: A single check-in datum from Supabase containing `ticket_id`, `checked_in_at`, `checked_in_gate`, `checked_in_by`, and `checkin_method`.
- **Batch**: The complete set of `CheckinRecord` objects sent in a single request, identified by a `batch_id` UUID.
- **SharedSecret**: A server-side environment variable (`CHECKIN_SYNC_BACK_SECRET`) used to authenticate inbound requests via Bearer token comparison.
- **SyncBack_Middleware**: The Laravel middleware that validates the `Authorization: Bearer {SharedSecret}` header before the request reaches the controller.
- **SyncBack_Request**: The Laravel Form Request DTO that validates the incoming JSON body structure.
- **SyncBack_ResponseDTO**: The DTO that carries `batch_id`, `succeeded`, `failed`, `total`, and `failures` back to the caller.
- **FailureRecord**: A single entry in the `failures` array of the response, carrying `ticket_id` and `reason`.
- **Chunk**: A sub-slice of a Batch used for bulk database operations; default size 500 records.
- **Idempotency Key**: The composite key `(ticket_id, checked_in_at)` used to detect duplicate records.

---

## Requirements

### Requirement 1: Endpoint Authentication

**User Story:** As Pankaj, I want a clean, well-defined endpoint Supabase can call without ambiguity, so that the integration is secure and unambiguous.

#### Acceptance Criteria

1. WHEN a POST request arrives at `/internal/checkin/sync-back` without an `Authorization` header, THEN THE SyncBack_Middleware SHALL return HTTP 401 with a JSON error body `{"error": "Unauthorized"}`.
2. WHEN a POST request arrives with an `Authorization: Bearer {token}` header where `token` does not match the `CHECKIN_SYNC_BACK_SECRET` environment variable, THEN THE SyncBack_Middleware SHALL return HTTP 401 with a JSON error body `{"error": "Unauthorized"}`.
3. WHEN a POST request arrives with a valid `Authorization: Bearer {token}` header, THE SyncBack_Middleware SHALL pass the request to the controller without modification.
4. THE SyncBack_Middleware SHALL use a constant-time string comparison when validating the Bearer token to prevent timing-attack leakage.
5. THE SyncBack_Endpoint SHALL NOT expose the value of `CHECKIN_SYNC_BACK_SECRET` in any response body or log entry.

---

### Requirement 2: Request Validation

**User Story:** As Pankaj, I want a clean, well-defined endpoint Supabase can call without ambiguity, so that malformed payloads are rejected before any processing begins.

#### Acceptance Criteria

1. THE SyncBack_Request SHALL require `event_id` as a non-empty string in the request body.
2. THE SyncBack_Request SHALL require `batch_id` as a valid UUID v4 string in the request body.
3. THE SyncBack_Request SHALL require `records` as a non-empty array containing at least one CheckinRecord.
4. THE SyncBack_Request SHALL require each CheckinRecord to contain `ticket_id` (non-empty string), `checked_in_at` (ISO 8601 UTC datetime string), `checked_in_gate` (non-empty string), `checked_in_by` (non-empty string), and `checkin_method` (one of: `qr_scan`, `manual`, `nfc`).
5. WHEN the request body fails validation, THEN THE SyncBack_Endpoint SHALL return HTTP 422 with a structured JSON error body listing each failing field and its validation message.
6. THE SyncBack_Request SHALL accept a `records` array of up to 10,000 CheckinRecord objects in a single request.
7. WHEN a failure occurs after validation has succeeded (such as a database connection error or an unhandled infrastructure exception), THEN THE SyncBack_Endpoint SHALL return a structured JSON error body (e.g. `{"error": "Internal Server Error"}`) with an appropriate HTTP status code rather than an unstructured response.

---

### Requirement 3: Ticket Update Processing

**User Story:** As a host, I want my main ExplaraX dashboard to reflect check-in status after the event, so that I can view accurate attendance data.

#### Acceptance Criteria

1. WHEN the request is authenticated and validated, THE SyncBack_Service SHALL attempt to update each CheckinRecord's corresponding row in the `tickets` table using `ticket_id` as the lookup key.
2. THE Ticket_Repository SHALL update the following fields on the matched ticket row: `checked_in_at`, `checked_in_gate`, `checked_in_by`, `checkin_method`, and `updated_at`.
3. THE Ticket_Repository SHALL use a bulk `UPDATE … WHERE ticket_id IN (…)` operation per Chunk rather than individual per-record queries.
4. THE SyncBack_Service SHALL process records in Chunks of up to 500 to limit memory consumption and query size. IF the total number of records in a Batch is not evenly divisible by 500, THEN the final Chunk SHALL contain the remaining records (fewer than 500) and SHALL be processed identically to a full Chunk.
5. WHEN a Chunk is being written, THE Ticket_Repository SHALL wrap the bulk update in a database transaction to ensure atomicity within the Chunk.

---

### Requirement 4: Idempotency

**User Story:** As Pankaj, I want receiving the same batch twice to be a no-op, so that Supabase can safely retry without corrupting data.

#### Acceptance Criteria

1. BEFORE updating a ticket, THE SyncBack_Service SHALL check whether a record with the same `(ticket_id, checked_in_at)` pair already exists in the `tickets` table with matching check-in fields.
2. WHEN a CheckinRecord is identified as a duplicate via its Idempotency Key, THE SyncBack_Service SHALL skip that record without updating the database and without logging an error.
3. WHEN a CheckinRecord is skipped as a duplicate, THE SyncBack_Service SHALL include it in the `succeeded` count of the response (it was already successfully applied).
4. THE SyncBack_Service SHALL NOT return an error response when all records in a Batch are duplicates.

---

### Requirement 5: Missing Ticket Error Handling

**User Story:** As Pankaj, I want records for non-existent tickets to be captured for review, so that data discrepancies between Supabase and ExplaraX can be audited.

#### Acceptance Criteria

1. WHEN THE Ticket_Repository cannot find a `ticket_id` in the `tickets` table, THEN THE SyncBack_Service SHALL continue processing the remaining records in the Batch without aborting.
2. WHEN a `ticket_id` is not found, THEN THE SyncError_Repository SHALL insert a row into `checkin_sync_errors` with the fields: `event_id`, `ticket_id`, `reason` (value: `"ticket not found in ExplaraX"`), `payload` (the full CheckinRecord JSON), and `created_at` (current UTC timestamp).
3. WHEN a `ticket_id` is not found, THEN THE SyncBack_Service SHALL increment the `failed` counter and add a FailureRecord `{"ticket_id": "…", "reason": "ticket not found in ExplaraX"}` to the response failures list.
4. IF all records in a Batch reference non-existent ticket_ids, THEN THE SyncBack_Endpoint SHALL still return HTTP 200 with the counts reflecting 0 succeeded and N failed.

---

### Requirement 6: Response Contract

**User Story:** As Pankaj, I want a structured response so that Supabase knows exactly how many records were applied, skipped, or failed.

#### Acceptance Criteria

1. WHEN all records have been attempted, THE SyncBack_Endpoint SHALL return HTTP 200 with a JSON body containing: `batch_id` (echoing the request's `batch_id`), `succeeded` (integer ≥ 0), `failed` (integer ≥ 0), `total` (integer ≥ 1), and `failures` (array of FailureRecord objects).
2. THE SyncBack_ResponseDTO SHALL satisfy the invariant: `succeeded + failed = total` for every response.
3. THE SyncBack_ResponseDTO SHALL set `total` equal to the count of records in the request `records` array.
4. WHEN `failed` is 0, THE SyncBack_ResponseDTO SHALL return `failures` as an empty array `[]`.
5. THE SyncBack_Endpoint SHALL NOT return HTTP 5xx for validation or business-logic failures; HTTP 5xx is reserved for unhandled infrastructure exceptions.
6. WHEN all records in a Batch fail due to business-logic reasons (such as all ticket_ids not found or all records being duplicates), THEN THE SyncBack_Endpoint SHALL return HTTP 200 with the appropriate counts in the response body rather than an error status code.

---

### Requirement 7: Performance

**User Story:** As Pankaj, I want the sync-back to handle 10,000 records reliably, so that large events like TCS-10K-2026 can be synced without timeout.

#### Acceptance Criteria

1. THE SyncBack_Service SHALL complete processing of a Batch of 10,000 CheckinRecords within 120 seconds (2 minutes) under normal PostgreSQL load conditions.
2. THE SyncBack_Service SHALL process CheckinRecords in Chunks of 500 records using bulk database operations to minimise round-trip count.
3. THE Ticket_Repository SHALL use a single bulk `UPDATE` statement per Chunk rather than looping individual `UPDATE` statements.
4. THE SyncError_Repository SHALL use a single bulk `INSERT` statement per Chunk of failed records rather than individual inserts.

---

### Requirement 8: Structured Logging

**User Story:** As Pankaj, I want structured logs for every sync-back invocation, so that I can audit, trace, and debug issues post-event.

#### Acceptance Criteria

1. THE SyncBack_Service SHALL emit a structured JSON log entry at the start of processing containing: `event_id`, `batch_id`, `total_records`, `request_id`.
2. THE SyncBack_Service SHALL emit a structured JSON log entry at the end of processing containing: `event_id`, `batch_id`, `succeeded`, `failed`, `duration_ms`, `request_id`.
3. WHEN a CheckinRecord fails due to a missing `ticket_id`, THE SyncBack_Service SHALL emit a structured JSON log entry containing: `event_id`, `batch_id`, `ticket_id`, `reason`, `request_id`.
4. THE SyncBack_Service SHALL NOT log the full value of the `Authorization` header or the SharedSecret.

---

## Correctness Properties

The following properties are suitable for property-based testing (PHPUnit + data providers or a PBT library). They describe invariants that must hold for arbitrary inputs, not just fixed examples.

### Property 1: Response Count Invariant

For any valid authenticated request with N records (where N ∈ [1, 10000]):

```
response.succeeded + response.failed = response.total
response.total = count(request.records)
response.failures.length = response.failed
```

This must hold regardless of how many ticket_ids are valid, invalid, or duplicates.

### Property 2: Idempotency Property

For any valid batch B:

```
state_after_call_1(B) = state_after_call_2(B)
```

Specifically:
- The `tickets` table rows affected by B must have identical field values after the first call and after a second identical call.
- The `checkin_sync_errors` rows for B must not be duplicated by the second call.
- The second call's `succeeded + failed = total` must equal the first call's total.

### Property 3: Error Isolation Property

For any batch containing M invalid ticket_ids and (N - M) valid ticket_ids:

```
response.succeeded >= (N - M)   // valid tickets were processed
response.failed = M              // all invalid tickets are counted
checkin_sync_errors.count(batch) = M
```

The invalid records must not prevent valid records from being updated.

### Property 4: Failure Array Completeness

For any batch where `failed > 0`:

```
foreach failure in response.failures:
    failure.ticket_id is present
    failure.reason is non-empty string
response.failures.length = response.failed
```

### Property 5: Duplicate Records are Counted as Succeeded

For any batch where all N records are duplicates of already-applied data:

```
response.succeeded = N
response.failed = 0
response.failures = []
```

No new rows in `checkin_sync_errors`. No change to `tickets` table.
