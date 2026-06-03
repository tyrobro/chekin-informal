# Requirements Document

## Introduction

This feature implements the **"Prepare Check-in" flow** (Slice B1) for the ExplaraX Host Dashboard at `checkin.explarax.com`. It allows event hosts to synchronize their attendee list from the ExplaraX core database into the isolated check-in environment prior to an event. The flow covers the preparation modal, verification policy configuration, real-time sync progress display, error/retry handling, and idempotent re-sync capability. The backend is represented by a mocked API service for this slice.

## Glossary

- **Host**: An authenticated event organizer or admin using the Host Dashboard.
- **Dashboard**: The ExplaraX Host Dashboard UI served at `checkin.explarax.com`.
- **Prepare_Modal**: The confirmation dialog shown before triggering a sync.
- **Resync_Modal**: The confirmation dialog shown when triggering a re-sync on an already-prepared event.
- **Progress_View**: The in-page UI area displaying real-time sync progress (progress bar and status text).
- **Mock_API**: The frontend mock service that simulates `POST /internal/checkin/prepare/{event_id}` using `setTimeout` and incremental progress callbacks.
- **Verification_Policy**: The manual lookup mode selected by the host — one of "Mode A only", "Mode B only", "Both (recommended)", or "Neither (QR only)".
- **Event_Status**: The current preparation state of an event — one of `not_prepared`, `prepared`, or `live`.
- **Sync_Job**: The asynchronous task that copies attendee records into the check-in environment.
- **Mode_A**: Manual verification by Ticket ID.
- **Mode_B**: Manual verification by ID Document.
- **Auth_Flag**: The `const isAuthenticated = true` flag that bypasses real login for this slice.

---

## Requirements

### Requirement 1: Mocked Authentication

**User Story:** As a host, I want the dashboard to be accessible without a real login flow for this development slice, so that I can test the prepare flow immediately.

#### Acceptance Criteria

1. THE Dashboard SHALL use an `Auth_Flag` (`const isAuthenticated = true`) to bypass real authentication for this slice.
2. IF `Auth_Flag` is `true`, THEN THE Dashboard SHALL render the host event list view without redirecting to a login page.
3. IF `Auth_Flag` is `false`, THEN THE Dashboard SHALL display an "Access Denied" message with no event list content rendered.
4. IF the Dashboard fails to load the event list due to a data or rendering error, THEN THE Dashboard SHALL display an error message identifying the nature of the failure and a retry action, with no partial event list content rendered.

---

### Requirement 2: Event Status Display

**User Story:** As a host, I want to see the current preparation status of each event, so that I know whether an event needs to be prepared, has been prepared, or is live.

#### Acceptance Criteria

1. THE Dashboard SHALL display each event with its `Event_Status` badge — one of "Not Prepared", "Prepared", or "Live".
2. WHEN `Event_Status` is `not_prepared`, THE Dashboard SHALL show a "Prepare Check-in" button rendered with a filled accent-color background alongside the event.
3. WHEN `Event_Status` is `prepared` or `live`, THE Dashboard SHALL show a "Re-sync" button rendered with an outlined accent-color style alongside the event.
4. WHEN `Event_Status` is `prepared` or `live`, THE Dashboard SHALL show "Invite Check-in Staff" and "View Live Dashboard" action buttons together alongside the event — both buttons SHALL always appear as a pair and SHALL both be hidden if either is unavailable.
5. IF an event's `Event_Status` is null or an unrecognised value, THEN THE Dashboard SHALL display a "Status Unknown" badge and no action buttons for that event.

---

### Requirement 3: Prepare Check-in Modal

**User Story:** As a host, I want to see a confirmation modal before triggering a sync, so that I can review the attendee count, configure the verification policy, and confirm my intent.

#### Acceptance Criteria

1. WHEN the host clicks "Prepare Check-in" on a `not_prepared` event, THE Dashboard SHALL open the `Prepare_Modal`.
2. THE `Prepare_Modal` SHALL display the message "This will sync [N] attendees to the check-in system." where [N] is the total attendee count for the event.
3. IF the total attendee count for the event is zero, THEN THE `Prepare_Modal` SHALL disable the "Prepare" button and display a message indicating there are no attendees available to sync for this event.
4. THE `Prepare_Modal` SHALL display a `Verification_Policy` selector with four radio button options: "Mode A only", "Mode B only", "Both (recommended)", and "Neither (QR only)".
5. THE `Prepare_Modal` SHALL pre-select "Both (recommended)" as the default `Verification_Policy`.
6. THE `Prepare_Modal` SHALL display a "Cancel" button and a "Prepare" primary action button.
7. WHEN the host clicks "Cancel" in the `Prepare_Modal`, THE Dashboard SHALL close the `Prepare_Modal` without triggering a `Sync_Job`.
8. WHEN the host selects a `Verification_Policy` option, THE `Prepare_Modal` SHALL reflect the selected option within 100ms.
9. WHEN the host clicks "Prepare" in the `Prepare_Modal`, THE Dashboard SHALL close the `Prepare_Modal` and trigger a `Sync_Job` using the selected `Verification_Policy`.

---

### Requirement 4: Mock API Service

**User Story:** As a developer, I want a mock API service that simulates the backend prepare endpoint, so that I can build and test the UI without a real backend connection.

#### Acceptance Criteria

1. THE `Mock_API` SHALL expose a function that simulates `POST /internal/checkin/prepare/{event_id}`.
2. THE `Mock_API` SHALL accept an `event_id`, a `Verification_Policy` value (one of "mode_a_only", "mode_b_only", "both", or "qr_only"), and a callback for incremental progress updates as inputs.
3. THE `Mock_API` SHALL emit incremental progress updates via the callback, reporting `synced` count and `total` count at intervals between 200ms and 800ms.
4. WHEN the `synced` count equals the `total` count, THE `Mock_API` SHALL invoke the callback with a final payload carrying `status: "success"`.
5. THE `Mock_API` SHALL include a configurable `simulateError` boolean toggle that defaults to `false`.
6. WHEN `simulateError` is `true`, THE `Mock_API` SHALL stop progress after between 30% and 70% of the total attendees have been reported as synced and SHALL invoke the callback with a payload carrying `status: "error"` and the `synced` count at the point of failure.
7. WHEN `simulateError` is `false`, THE `Mock_API` SHALL complete the full sync and invoke the callback with a final payload carrying `status: "success"`.
8. THE `Mock_API` SHALL be the only source of backend interaction in this slice — no real `fetch` calls SHALL be made to any external endpoint.

---

### Requirement 5: Sync Progress Display

**User Story:** As a host, I want to see a live progress bar while attendees are being synced, so that I know the job is running and can track how far along it is.

#### Acceptance Criteria

1. WHEN the host clicks "Prepare" in the `Prepare_Modal`, THE Dashboard SHALL close the `Prepare_Modal` and display the `Progress_View`.
2. THE `Progress_View` SHALL display a progress bar on a 0–100% scale, calculated as `(synced / total) × 100`, starting at 0% before the first callback is received.
3. THE `Progress_View` SHALL display status text in the format "Syncing [synced] of [total] attendees…" updated with each progress callback from the `Mock_API`.
4. WHILE the `Sync_Job` is running, THE `Progress_View` SHALL render the "Prepare Check-in" and "Re-sync" buttons for the event being synced in a visually disabled state — non-clickable and not reachable via keyboard focus.
5. WHEN the `Sync_Job` completes (success or failure), THE Dashboard SHALL re-enable the "Prepare Check-in" and "Re-sync" buttons for that event within the same render cycle as the completion callback.
6. WHILE the `Sync_Job` is running, THE Dashboard SHALL allow the host to click "Prepare Check-in" and "Re-sync" on all other events without restriction.

---

### Requirement 6: Sync Success State

**User Story:** As a host, I want the event status to update automatically when the sync completes, so that I know the event is ready and can access post-preparation actions.

#### Acceptance Criteria

1. WHEN the `Mock_API` callback is received carrying `status: "success"`, THE Dashboard SHALL update the event's `Event_Status` to `prepared`.
2. WHEN the `Event_Status` changes to `prepared`, THE Dashboard SHALL replace the `Progress_View` with a success confirmation message "Sync complete — [total] attendees are ready for check-in." where [total] is the final synced attendee count from the `Mock_API` response.
3. THE success confirmation message SHALL persist until the host navigates away from the event.
4. WHEN the `Event_Status` changes to `prepared`, THE Dashboard SHALL display the "Invite Check-in Staff" and "View Live Dashboard" action buttons for that event.
5. WHEN the host clicks "Invite Check-in Staff", THE Dashboard SHALL navigate to the invite staff route (stub navigation only for this slice).
6. WHEN the host clicks "View Live Dashboard", THE Dashboard SHALL navigate to the live dashboard route (stub navigation only for this slice).

---

### Requirement 7: Sync Error and Retry State

**User Story:** As a host, I want to see a clear error message and a retry option if the sync fails, so that I can recover without losing the progress already made.

#### Acceptance Criteria

1. WHEN the `Mock_API` callback is received carrying `status: "error"`, THE `Progress_View` SHALL freeze the progress bar at the percentage value it had reached at the point of failure.
2. WHEN the `Mock_API` reports a failure state with at least one attendee processed (`synced` > 0), THE `Progress_View` SHALL display an error message in the format "Sync failed — [synced] of [total] attendees uploaded. [failed] attendees could not be synced." where [failed] = [total] − [synced].
3. WHEN the `Mock_API` reports a failure state before processing any attendees (`synced` = 0), THE `Progress_View` SHALL display the message "Sync could not be started — please check your connection and try again."
4. WHEN the `Mock_API` reports a failure state, THE `Progress_View` SHALL display a "Retry" primary action button.
5. WHEN the host clicks "Retry", THE Dashboard SHALL re-invoke the `Mock_API` for the same event and `Verification_Policy`; already-synced attendees SHALL be skipped by the mock (not re-processed), and the progress display SHALL reset to 0% visually before incrementing again.
6. IF the `Mock_API` reports a failure state, THEN THE Dashboard SHALL NOT change the event's `Event_Status` to `prepared`.
7. WHILE the `Mock_API` has reported a failure state and the host has not yet clicked "Retry" or navigated away, THE `Progress_View` SHALL continue to display the error message and "Retry" button.

---

### Requirement 8: Re-sync Modal

**User Story:** As a host, I want to re-sync an already-prepared event if new tickets were sold, so that newly registered attendees are included in the check-in system without affecting existing check-in records.

#### Acceptance Criteria

1. WHEN the host clicks "Re-sync" on a `prepared` or `live` event, THE Dashboard SHALL open the `Resync_Modal`.
2. THE `Resync_Modal` SHALL display the message "Re-syncing will refresh attendee data with any new tickets sold. Existing check-ins are preserved."
3. THE `Resync_Modal` SHALL display a "Cancel" button and a "Re-sync" primary action button.
4. WHEN the host clicks "Cancel" in the `Resync_Modal`, THE Dashboard SHALL close the `Resync_Modal` without triggering a `Sync_Job`.
5. WHEN the host clicks "Re-sync" in the `Resync_Modal`, THE Dashboard SHALL close the `Resync_Modal`, immediately display the `Progress_View`, and then trigger the `Mock_API` for that event.
6. WHEN the `Mock_API` is triggered via a re-sync, THE Dashboard SHALL use the same payload structure as a first-time sync — no distinct re-sync payload format is required.
7. WHEN the `Mock_API` reports a failure state after a re-sync is triggered, THE `Progress_View` SHALL display the error state and the event's `Event_Status` SHALL remain unchanged at its previous value (`prepared` or `live`).
8. WHILE a `Sync_Job` is already in progress for an event, THE Dashboard SHALL render the "Re-sync" button for that event in a disabled state so that concurrent re-sync triggers are prevented.

---

### Requirement 9: Design System Compliance

**User Story:** As a product stakeholder, I want all UI components to use the ExplaraX design tokens, so that the host dashboard is visually consistent with the broader ExplaraX brand.

#### Acceptance Criteria

1. THE Dashboard SHALL render all primary action buttons with a filled `#7E57C2` background and white (`#FFFFFF`) text as their default (non-focused, non-active) state.
2. WHEN a primary action button receives keyboard focus, THE Dashboard SHALL apply a focus ring using `#7E57C2`.
3. WHEN a primary action button is in an active/pressed state, THE Dashboard SHALL apply `#7E57C2` to its active state indicator.
4. WHEN a primary action button is in a hover state, THE Dashboard SHALL apply a visually distinct hover treatment derived from `#7E57C2` (e.g., darkened or lightened shade).
5. THE Dashboard SHALL render all secondary action buttons with a transparent background, a 1px solid `#7E57C2` border, and `#7E57C2` text; on hover, a visually distinct hover treatment derived from `#7E57C2` SHALL be applied.
6. THE Dashboard SHALL apply `#5BC97C` as the foreground color for all success state indicators and completion messages.
7. THE Dashboard SHALL apply `#D64545` as the foreground color for all error state indicators and failure messages.
8. THE Dashboard SHALL use a white background (`#FFFFFF`) with a 1px solid `#F0F0F0` border for all card and surface elements.
9. THE Dashboard SHALL apply `#3B3535` as the default body text color.
10. THE Dashboard SHALL use a named sans-serif typeface as the primary font with a generic `sans-serif` CSS fallback for all typography.
