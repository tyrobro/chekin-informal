# Requirements Document

## Introduction

Slice C3 implements automatic post-event sync-back orchestration for ExplaraX Check-in.
Once an event's `end_time` passes, the system must automatically harvest all checked-in
attendee records from Supabase and POST them to the existing C2 sync-back endpoint
(`POST /internal/checkin/sync-back`), without any host action. If the automatic sync
fails, the host can trigger a manual retry that resumes from the last successful batch —
never restarting from scratch.

This slice builds exclusively on top of C1 (Attendee Sync) and C2 (Sync-Back Endpoint).
It MUST NOT duplicate or modify any logic already owned by those slices.

## Glossary

- **Scheduler**: Laravel's built-in command scheduler (`app/Console/Kernel.php`), configured to fire every 5 minutes.
- **EventFinderService**: Service responsible for querying the ExplaraX core PostgreSQL database and returning events eligible for post-event sync-back.
- **CheckedInAttendeeRepository**: Repository responsible for fetching all checked-in attendee records for a given event from Supabase.
- **BatchPartitioner**: Existing utility from C1 (`App\Features\AttendeeSync\Support\BatchPartitioner`) that splits flat arrays into fixed-size chunks. Reused in C3 with a batch size of 1,000.
- **SyncBackDispatcher**: Service responsible for iterating over batches and POSTing each one to the C2 `POST /internal/checkin/sync-back` endpoint.
- **CheckpointRepository**: Repository responsible for persisting and reading per-event sync progress in the `event_sync_status` table, including `sync_status`, `last_successful_batch`, `completed_at`, and `error_message`.
- **RetryService**: Service that reads the current checkpoint for a failed event and re-triggers sync-back starting from `last_successful_batch + 1`.
- **PostEventSyncOrchestrator**: Top-level service that coordinates EventFinderService → CheckedInAttendeeRepository → BatchPartitioner → SyncBackDispatcher → CheckpointRepository for a single event.
- **event_sync_status**: ExplaraX core PostgreSQL table that persists the sync state for each event (`event_id`, `sync_status`, `last_successful_batch`, `total_batches`, `completed_at`, `error_message`).
- **sync_status**: Enum-like string column on `event_sync_status`. Valid values: `pending`, `in_progress`, `complete`, `failed`.
- **Correlation_ID**: A UUID generated per scheduler run (or per retry invocation), included in all structured log entries for that execution.

---

## Requirements

### Requirement 1: Scheduled Event Discovery

**User Story:** As a host, I want sync-back to happen automatically when my event ends, so that I do not have to click anything.

#### Acceptance Criteria

1. THE Scheduler SHALL invoke the PostEventSyncOrchestrator every 5 minutes.
2. WHEN the Scheduler fires, THE EventFinderService SHALL query the `event_sync_status` table for all rows where `end_time < NOW()` AND `sync_status <> 'complete'`.
3. THE EventFinderService SHALL return only event IDs that satisfy both conditions simultaneously — events that ended but whose sync is not yet marked complete.
4. WHILE a sync run is already `in_progress` for a given event, THE Scheduler SHALL skip that event and not dispatch a duplicate orchestration for it.
5. IF the EventFinderService query returns zero eligible events, THEN THE Scheduler SHALL exit successfully without error or alert.
6. THE EventFinderService SHALL include events with `sync_status` of `pending`, `in_progress`, and `failed` in its result set, as all of them satisfy `<> 'complete'`.

---

### Requirement 2: Checked-In Attendee Retrieval

**User Story:** As a host, I want all attendees who checked in to be synced back to ExplaraX, so that the main dashboard reflects accurate attendance.

#### Acceptance Criteria

1. WHEN the PostEventSyncOrchestrator processes an event, THE CheckedInAttendeeRepository SHALL fetch all rows for that event where `checked_in_at IS NOT NULL` from Supabase.
2. THE CheckedInAttendeeRepository SHALL return records containing: `ticket_id`, `checked_in_at`, `checked_in_gate`, `checked_in_by`, `checkin_method` — the exact fields required by the C2 contract.
3. IF the CheckedInAttendeeRepository returns zero records for an event, THEN THE PostEventSyncOrchestrator SHALL mark `sync_status = 'complete'` with `completed_at = NOW()` and SHALL NOT dispatch any batch to the C2 endpoint.
4. THE CheckedInAttendeeRepository SHALL NOT return attendees where `checked_in_at IS NULL`.

---

### Requirement 3: Batch Partitioning

**User Story:** As a Cloud Infra engineer, I want attendee records processed in fixed-size batches, so that memory usage is bounded and the C2 endpoint receives well-sized payloads.

#### Acceptance Criteria

1. THE PostEventSyncOrchestrator SHALL partition checked-in attendee records into batches using the existing `BatchPartitioner` with a batch size of 1,000 records.
2. THE BatchPartitioner SHALL produce batches where every non-final batch contains exactly 1,000 records, and the final batch contains between 1 and 1,000 records inclusive.
3. FOR ALL inputs with N checked-in records, THE BatchPartitioner SHALL produce `ceil(N / 1000)` batches, and flattening all batches SHALL yield exactly the original N records in their original order (round-trip invariant).
4. THE PostEventSyncOrchestrator SHALL assign a sequential 1-based batch index to each batch, recorded as `batch_number` in the payload sent to the C2 endpoint.

---

### Requirement 4: Sync-Back Dispatch

**User Story:** As a host, I want each batch of check-ins delivered to ExplaraX reliably, so that no check-in data is lost.

#### Acceptance Criteria

1. WHEN the PostEventSyncOrchestrator dispatches a batch, THE SyncBackDispatcher SHALL POST the batch to `POST /internal/checkin/sync-back` with the `Authorization: Bearer {SHARED_SECRET}` header and the JSON body defined by the C2 contract.
2. THE SyncBackDispatcher SHALL include a stable, deterministic `batch_id` per batch, derived from `event_id` and `batch_number`, so that retrying the same batch produces the same `batch_id` and C2's idempotency guarantees suppress duplicates.
3. WHEN the C2 endpoint returns HTTP 200, THE SyncBackDispatcher SHALL report the batch as succeeded and record the `batch_number` as `last_successful_batch` in the CheckpointRepository.
4. WHEN the C2 endpoint returns a 5xx error or a network timeout, THE SyncBackDispatcher SHALL retry the request using exponential backoff up to 3 attempts before treating the batch as permanently failed.
5. WHEN the C2 endpoint returns HTTP 4xx (excluding 429), THE SyncBackDispatcher SHALL treat the batch as permanently failed without retrying, as 4xx responses indicate a non-transient client error.
6. WHEN the C2 endpoint returns HTTP 429, THE SyncBackDispatcher SHALL treat it as a transient error and apply the same retry logic as 5xx responses.
7. THE SyncBackDispatcher SHALL log each batch attempt (start, success, and final failure) as structured JSON with `event_id`, `batch_number`, `batch_id`, and `correlation_id`.

---

### Requirement 5: Checkpoint Persistence

**User Story:** As a Cloud Infra engineer, I want sync progress checkpointed after every successful batch, so that retries resume from the right place and no records are reprocessed.

#### Acceptance Criteria

1. WHEN a batch succeeds, THE CheckpointRepository SHALL atomically update `last_successful_batch = batch_number` and `sync_status = 'in_progress'` for that event.
2. WHEN the final batch succeeds, THE CheckpointRepository SHALL set `sync_status = 'complete'` and `completed_at = NOW()` in the same atomic write.
3. WHEN a batch fails permanently, THE CheckpointRepository SHALL set `sync_status = 'failed'` and persist the `error_message` for that event.
4. THE CheckpointRepository SHALL perform all updates as single atomic SQL statements to prevent partial writes.
5. THE `event_sync_status` table SHALL contain at most one row per `event_id`, enforced by a unique constraint.

---

### Requirement 6: Resumable Retry

**User Story:** As a host, I want a manual override if automatic sync fails, so that I can recover without waiting for re-implementation.

#### Acceptance Criteria

1. WHEN the host triggers a manual retry for a `failed` event, THE RetryService SHALL read `last_successful_batch` from the CheckpointRepository and begin dispatching from batch `last_successful_batch + 1`.
2. THE RetryService SHALL NOT restart from batch 1 if `last_successful_batch > 0`.
3. IF `last_successful_batch = 0` (no batch ever succeeded), THEN THE RetryService SHALL begin from batch 1.
4. WHEN the host triggers a manual retry for an event with `sync_status = 'complete'`, THE RetryService SHALL return a 409 Conflict response and SHALL NOT re-dispatch any batches.
5. WHEN the host triggers a manual retry for an event with `sync_status = 'in_progress'`, THE RetryService SHALL return a 409 Conflict response and SHALL NOT dispatch a second concurrent sync.
6. FOR ANY value of `last_successful_batch` N (where N ≥ 0), retrying the same batches multiple times SHALL produce the same final `sync_status` and `last_successful_batch` value as a single retry (idempotency).
7. THE RetryService SHALL set `sync_status = 'in_progress'` atomically before dispatching the first retry batch.

---

### Requirement 7: Failure Handling and Monitoring

**User Story:** As a Cloud Infra engineer, I want an alert when sync permanently fails, so that I can investigate and take action before the host notices.

#### Acceptance Criteria

1. WHEN a permanent batch failure is recorded, THE PostEventSyncOrchestrator SHALL emit a structured monitoring alert containing `event_id`, `batch_number`, `error_message`, and `correlation_id`.
2. THE monitoring alert SHALL be emitted via a dedicated channel resolvable from config (defaulting to the application log at `critical` level) so the implementation is injectable and testable without a live alerting service.
3. WHEN a permanent batch failure occurs, THE PostEventSyncOrchestrator SHALL stop processing subsequent batches for that event and SHALL NOT mark any later batch as succeeded.
4. THE error_message persisted to `event_sync_status` SHALL contain the HTTP status code and response body excerpt (truncated to 500 characters) to aid investigation.

---

### Requirement 8: Event Sync Status Initialisation

**User Story:** As a host, I want the dashboard to show "Completed (Syncing)" while sync is running, so that I have visibility into the post-event process.

#### Acceptance Criteria

1. WHEN an event is first identified as eligible for sync-back (and no `event_sync_status` row exists yet), THE PostEventSyncOrchestrator SHALL insert a row with `sync_status = 'pending'` before fetching checked-in attendees.
2. WHEN the PostEventSyncOrchestrator begins dispatching batches, THE CheckpointRepository SHALL transition `sync_status` from `pending` to `in_progress`.
3. THE `event_sync_status` table SHALL record `total_batches` once partitioning is complete, enabling dashboard progress computation.

---

### Requirement 9: Idempotency

**User Story:** As a Cloud Infra engineer, I want the orchestration to be safe to run multiple times, so that scheduler overlaps or manual retries never produce duplicate check-in updates in ExplaraX.

#### Acceptance Criteria

1. THE PostEventSyncOrchestrator SHALL rely on the C2 endpoint's existing idempotency guarantees (deduplication by `ticket_id + checked_in_at`) and SHALL NOT implement separate duplicate-detection logic.
2. THE `batch_id` sent to C2 SHALL be deterministically derived from `event_id` and `batch_number` so that replaying the same batch produces the same `batch_id`, allowing C2 to detect and skip duplicates.
3. WHEN the Scheduler fires while an event's sync is `in_progress`, THE EventFinderService SHALL still return that event (since `in_progress <> 'complete'`), but THE Scheduler SHALL skip it per Requirement 1.4, ensuring only one orchestration runs per event at a time.

---

### Requirement 10: Structured Logging and Correlation

**User Story:** As a Cloud Infra engineer, I want all sync operations logged with correlation IDs, so that I can trace a complete sync run across service boundaries.

#### Acceptance Criteria

1. THE PostEventSyncOrchestrator SHALL generate a UUID `correlation_id` at the start of each scheduler run and propagate it to all services invoked during that run.
2. WHEN any service (EventFinderService, SyncBackDispatcher, CheckpointRepository, RetryService) emits a log entry, THE entry SHALL include `correlation_id`, `event_id`, and `sync_status` at minimum.
3. THE SyncBackDispatcher SHALL log each batch result at `info` level for success and `error` level for permanent failure, including `batch_number`, `batch_id`, `succeeded`, `failed`, and `duration_ms`.
4. THE monitoring alert (Requirement 7.1) SHALL also carry the `correlation_id` so alerts can be cross-referenced with application logs.
