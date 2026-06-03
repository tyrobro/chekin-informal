# Implementation Plan: Checkin Prepare Flow (Slice B1)

## Overview

Implement the full "Prepare Check-in" flow as a self-contained React feature. The work is structured in seven groups: project scaffolding and design tokens, reusable UI atoms, mock API service, feature state hooks, feature UI components (shell + modals), wiring and integration, and the test suite. Each task builds incrementally so the component tree is always in a runnable state.

## Tasks

- [x] 1. Scaffold project and set up design tokens
  - [x] 1.1 Initialise Vite + React project and install dependencies
    - Run `npm create vite@latest . -- --template react` and `npm install`
    - Install test dependencies: `npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom fast-check`
    - Add `vitest` config block to `vite.config.js` (environment: `jsdom`, globals: `true`, setupFiles pointing to a `src/setupTests.js` that imports `@testing-library/jest-dom`)
    - _Requirements: 1.1_

  - [x] 1.2 Create design-token stylesheet `src/styles/tokens.css`
    - Define all `:root` CSS custom properties: `--color-primary`, `--color-primary-dark`, `--color-primary-light`, `--color-success`, `--color-error`, `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`
    - Define typography tokens: `--font-family`, `--font-size-base`, `--font-size-sm`, `--font-size-lg`
    - Define spacing tokens: `--space-xs` through `--space-xl`
    - Define radius tokens: `--radius-sm`, `--radius-md`, `--radius-lg`
    - Define transition tokens: `--transition-fast`, `--transition-base`
    - Import `tokens.css` in `src/main.jsx`
    - _Requirements: 9.1–9.10_

- [x] 2. Build reusable UI atom components
  - [x] 2.1 Implement `Button` component (`src/components/Button/Button.jsx` + `Button.module.css`)
    - Accept props: `variant` (`primary | secondary | danger`), `disabled`, `onClick`, `children`, `ariaLabel?`
    - When `disabled` is `true`, render native `disabled` attribute and `aria-disabled="true"`
    - Apply token-driven CSS: default/hover/focus/active/disabled states per design spec
    - Secondary variant: transparent background, 1px solid `--color-primary` border, `--color-primary` text
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 2.2 Implement `ProgressBar` component (`src/components/ProgressBar/ProgressBar.jsx` + `ProgressBar.module.css`)
    - Accept props: `percent` (0–100), `frozen` (boolean), `label` (string)
    - Render `<div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>`
    - Inner fill `<div>` with `width` CSS transition; add `.frozen` class when `frozen` is `true` to disable transition
    - _Requirements: 5.2, 7.1_

  - [x] 2.3 Implement `StatusBadge` component (`src/components/StatusBadge/StatusBadge.jsx` + `StatusBadge.module.css`)
    - Accept `status` prop: `not_prepared | prepared | live | unknown`
    - Map each status to a label string and a CSS modifier class
    - Stateless, purely presentational
    - _Requirements: 2.1, 2.5_

  - [x] 2.4 Implement `Modal` base shell (`src/components/Modal/Modal.jsx` + `Modal.module.css`)
    - Render via `ReactDOM.createPortal` into `document.body`
    - Render `<div role="dialog" aria-modal="true" aria-labelledby="modal-title">` with backdrop `<div>`
    - `useEffect` on mount: query all focusable elements inside dialog, store previously focused element, focus first focusable element
    - `keydown` handler: intercept `Tab`/`Shift+Tab` to wrap focus within dialog; `Escape` calls `onClose`
    - On unmount: restore focus to stored trigger element
    - Backdrop click calls `onClose`
    - _Requirements: 3.1, 8.1_

  - [x] 2.5 Implement `ErrorState` component (`src/components/ErrorState/ErrorState.jsx` + `ErrorState.module.css`)
    - Accept props: `message` (string), `onRetry` (function)
    - Render error message text and a "Retry" secondary `Button`
    - Apply `--color-error` to the message text
    - _Requirements: 1.4_

  - [x] 2.6 Implement `AccessDenied` component (`src/components/AccessDenied/AccessDenied.jsx` + `AccessDenied.module.css`)
    - Stateless. Render an "Access Denied" heading and explanatory message
    - _Requirements: 1.3_

- [ ] 3. Implement Mock API service
  - [x] 3.1 Write `src/api/mockCheckinApi.js` — `mockPrepareCheckin` function
    - Accept: `eventId`, `policy`, `totalAttendees`, `onProgress`, `options` (`simulateError`, `alreadySynced`)
    - Algorithm: random batch size (`1` to `ceil(total / 10)`), random delay 200–800 ms per tick via `setTimeout`
    - Compute `errorAt = floor(random(0.3, 0.7) × total)` when `simulateError` is `true`
    - Increment `currentSynced` each tick, clamped to `effectiveMax`; emit `{ status: 'progress' | 'success' | 'error', synced, total }` payloads
    - Return a `cancel` function that sets `cancelled = true` and calls `clearTimeout`
    - Support `alreadySynced` offset: set `currentSynced = alreadySynced` at initialisation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [-] 3.2 Write property tests for `mockPrepareCheckin` — Properties 6 & 7
    - **Property 6: Mock API progress is monotonically increasing and terminates with a success payload**
    - **Validates: Requirements 4.3, 4.4, 4.7**
    - **Property 7: Mock API error fires between 30% and 70% of total when simulateError is true**
    - **Validates: Requirements 4.6**
    - Use `fc.integer({ min: 1, max: 500 })` for `totalAttendees`; collect all emitted payloads and assert monotonicity + terminal status

  - [-] 3.3 Write unit tests for `mockPrepareCheckin`
    - Test: cancel function prevents further callbacks after it is called
    - Test: `alreadySynced` offset means first emitted `synced` value is ≥ `alreadySynced`
    - Test: final payload always has `synced === total` on success path
    - _Requirements: 4.3, 4.4, 4.8_

- [ ] 4. Implement feature state hooks
  - [-] 4.1 Write `src/features/prepare-sync/useSyncState.js`
    - `useReducer` with `syncReducer` handling actions: `SYNC_START`, `SYNC_PROGRESS`, `SYNC_SUCCESS`, `SYNC_ERROR`, `SYNC_RETRY`
    - State shape: `{ phases: Record<string, SyncState> }`; each `SyncState` has `phase`, `synced`, `total`, `policy`, `errorSynced`
    - `SYNC_START` → sets `phase: 'syncing'`, resets `synced: 0`, stores `policy` and `total`
    - `SYNC_RETRY` → sets `phase: 'syncing'`, resets `synced: 0` (visual reset per Req 7.5)
    - `SYNC_ERROR` → sets `phase: 'error'`, stores `errorSynced`
    - Expose: `getSyncState(eventId)`, `startSync`, `handleProgress`, `handleSuccess`, `handleError`, `retrySync`
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 7.1, 7.5, 7.6_

  - [~] 4.2 Write unit tests for `syncReducer`
    - Test all five transitions exhaustively: idle→syncing, syncing→success, syncing→error, error→syncing (retry), success→syncing (resync)
    - Test that `SYNC_ERROR` preserves `errorSynced` and does NOT set `phase: 'success'`
    - Test that unknown `eventId` initialises from `initialSyncState`
    - _Requirements: 5.4, 5.5, 7.6_

  - [x] 4.3 Write `src/features/prepare-sync/useEventStatus.js`
    - Manage `events` array using `useState`; initialise from `mockEvents.js` seed data
    - Expose `events` and `markPrepared(eventId)` which sets matching event's `status` to `'prepared'`
    - _Requirements: 6.1_

  - [x] 4.4 Write `src/features/prepare-sync/useModal.js`
    - `useState` for `activeModal: { type: 'prepare' | 'resync', eventId } | null`
    - Expose: `activeModal`, `openPrepareModal(eventId)`, `openResyncModal(eventId)`, `closeModal()`
    - _Requirements: 3.1, 8.1_

  - [x] 4.5 Create mock event seed data `src/features/prepare-sync/mockEvents.js`
    - Export an array of at least four `Event` objects covering all four status values: `not_prepared`, `prepared`, `live`, and `null` (unknown)
    - Each object: `{ id, name, totalAttendees, status }`
    - Include one event with `totalAttendees: 0` to exercise the zero-attendee guard
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.3_

- [ ] 5. Build feature UI components
  - [ ] 5.1 Implement `VerificationPolicySelector` (`src/features/prepare-sync/VerificationPolicySelector.jsx` + `.module.css`)
    - Accept props: `selected` (`VerificationPolicy`), `onChange`
    - Render `<fieldset>` with `<legend>` and four `<input type="radio">` controls, each with an explicit `<label>`
    - Use `aria-describedby` to link the fieldset description to the legend
    - _Requirements: 3.4, 3.5, 3.8_

  - [~] 5.2 Implement `PrepareModal` (`src/features/prepare-sync/PrepareModal.jsx` + `.module.css`)
    - Accept props: `event`, `onCancel`, `onConfirm`
    - Local `useState` for `selectedPolicy`, defaulting to `'both'`
    - Render attendee count message: "This will sync [N] attendees to the check-in system."
    - When `event.totalAttendees === 0`: disable "Prepare" `Button` and show explanatory message
    - Compose `Modal` shell + `VerificationPolicySelector` + Cancel/Prepare `Button` pair
    - Call `onConfirm(selectedPolicy)` on Prepare click; call `onCancel` on Cancel click
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [~] 5.3 Implement `ResyncModal` (`src/features/prepare-sync/ResyncModal.jsx` + `.module.css`)
    - Accept props: `event`, `onCancel`, `onConfirm`
    - No local state; renders via `Modal` shell
    - Display message: "Re-syncing will refresh attendee data with any new tickets sold. Existing check-ins are preserved."
    - Render Cancel (secondary) and "Re-sync" (primary) `Button` pair
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [~] 5.4 Implement `SyncProgressView` (`src/features/prepare-sync/SyncProgressView.jsx` + `.module.css`)
    - Accept props: `phase` (`syncing | error | success`), `synced`, `total`, `onRetry`
    - Compute `percent = total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : 0`
    - Render `ProgressBar` with `frozen` prop set to `true` when `phase === 'error'`
    - Wrap status text in `<div aria-live="polite" aria-atomic="true">`
    - Status text: "Syncing [synced] of [total] attendees…" (syncing), "Sync complete — [total] attendees are ready for check-in." (success), "Sync failed — [synced] of [total] attendees uploaded. [failed] attendees could not be synced." (error, synced > 0), "Sync could not be started — please check your connection and try again." (error, synced === 0)
    - Render Retry `Button` (primary) when `phase === 'error'`
    - Apply `--color-success` to success text; `--color-error` to error text
    - _Requirements: 5.2, 5.3, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 9.6, 9.7_

  - [~] 5.5 Implement `ActionBar` (`src/features/prepare-sync/ActionBar.jsx` + `.module.css`)
    - Accept props: `eventStatus`, `isSyncingElsewhere` (always `false` per Req 5.6), `onPrepareClick`, `onResyncClick`
    - `not_prepared`: render "Prepare Check-in" primary `Button`
    - `prepared` or `live`: render "Re-sync" secondary `Button` + "Invite Check-in Staff" and "View Live Dashboard" secondary `Button` pair
    - `unknown` / unrecognised: render nothing (no buttons)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 6.4, 6.5, 6.6_

  - [~] 5.6 Implement `EventCard` (`src/features/prepare-sync/EventCard.jsx` + `.module.css`)
    - Accept props: `event`, `syncState`, `onPrepareClick`, `onResyncClick`, `onRetryClick`
    - Render `StatusBadge` always
    - When `syncState.phase` is `syncing | error | success`: render `SyncProgressView`; otherwise render `ActionBar`
    - Disable `ActionBar` buttons when `syncState.phase === 'syncing'` via `Button` `disabled` prop
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 5.4, 8.8_

  - [~] 5.7 Implement `EventList` (`src/features/prepare-sync/EventList.jsx`)
    - Accept props: `events`, `syncStateMap`, `onPrepareClick`, `onResyncClick`, `onRetryClick`
    - Render `<ul role="list">` with one `<li>` / `EventCard` per event; pass through all callbacks
    - No local state
    - _Requirements: 2.1_

- [ ] 6. Wire everything together in `Dashboard` and connect `App`
  - [~] 6.1 Implement `Dashboard` (`src/features/prepare-sync/Dashboard.jsx`)
    - Read `AUTH_FLAG` constant; render `AccessDenied` if `false`
    - Compose `useEventStatus`, `useSyncState`, `useModal` hooks
    - Hold `cancelRefs` with `useRef` for per-event cancel functions
    - Implement `handlePrepareConfirm(eventId, policy)`: calls `startSync`, invokes `mockPrepareCheckin`, stores cancel fn
    - Implement `handleResyncConfirm(eventId)`: reuses stored policy from `getSyncState`, same flow as `handlePrepareConfirm`
    - Implement `handleRetry(eventId)`: calls `retrySync`, invokes `mockPrepareCheckin` with `alreadySynced: errorSynced`
    - Mock API callbacks dispatch `handleProgress`, `handleSuccess` (+ `markPrepared`), `handleError`
    - `useEffect` cleanup on unmount: call all stored cancel functions
    - Render `<main>` landmark → `EventList` + conditional `PrepareModal` / `ResyncModal`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.9, 5.1, 5.6, 6.1, 7.5, 8.5, 8.6_

  - [~] 6.2 Wire `Dashboard` into `src/App.jsx` and verify `main.jsx` bootstrapping
    - `App.jsx` renders `<Dashboard />`
    - `main.jsx` imports `tokens.css` before rendering `<App />`
    - _Requirements: 1.1, 9.1_

- [~] 7. Checkpoint — verify integration smoke test
  - Ensure the app renders without console errors in development mode
  - Verify Dashboard shows event list from seed data, all status badges display correctly
  - Manually confirm Prepare flow end-to-end: modal opens → confirm → progress updates → success state
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Write unit tests for reusable components
  - [~] 8.1 Write unit tests for `Button`
    - Test: `disabled` prop renders native `disabled` attribute and `aria-disabled="true"`
    - Test: primary variant applies correct CSS class; secondary variant applies correct CSS class
    - Test: `onClick` is not called when button is disabled
    - _Requirements: 5.4, 9.1, 9.5_

  - [~] 8.2 Write unit tests for `ProgressBar`
    - Test: `aria-valuenow` matches the `percent` prop for values 0, 50, 100
    - Test: `.frozen` CSS class is applied when `frozen` prop is `true`
    - Test: fill element `width` style reflects `percent`
    - _Requirements: 5.2, 7.1_

  - [~] 8.3 Write unit tests for `StatusBadge`
    - Test: each of `not_prepared`, `prepared`, `live`, `unknown` renders the correct label text and CSS modifier
    - _Requirements: 2.1, 2.5_

  - [~] 8.4 Write unit tests for `PrepareModal`
    - Test: default policy is `'both'` on first render
    - Test: "Prepare" button is disabled and explanatory message appears when `totalAttendees === 0`
    - Test: clicking "Prepare" calls `onConfirm` with the currently selected policy
    - Test: clicking "Cancel" calls `onCancel` without calling `onConfirm`
    - _Requirements: 3.3, 3.5, 3.7, 3.9_

  - [~] 8.5 Write unit tests for `SyncProgressView`
    - Test: syncing phase renders "Syncing X of Y attendees…" text
    - Test: success phase renders "Sync complete — Y attendees are ready for check-in."
    - Test: error phase with synced > 0 renders "Sync failed — X of Y attendees uploaded. Z attendees could not be synced."
    - Test: error phase with synced === 0 renders "Sync could not be started — please check your connection and try again."
    - Test: Retry button is present only when `phase === 'error'`
    - _Requirements: 5.3, 6.2, 7.2, 7.3, 7.4_

- [ ] 9. Write property-based tests (fast-check)
  - [~] 9.1 Write property test — Property 1: Unknown status renders Status Unknown badge with no action buttons
    - Use `fc.string()` filtered to values outside the known status set; render `EventCard` and assert badge text + no action buttons
    - **Validates: Requirements 2.5**

  - [~] 9.2 Write property test — Property 2: Invite and View action buttons always appear as a pair
    - Use `fc.constantFrom('prepared', 'live')` for status; assert both buttons present or both absent together
    - **Validates: Requirements 2.4**

  - [~] 9.3 Write property test — Property 3: PrepareModal attendee count message is accurate for any event
    - Use `fc.nat()` for `totalAttendees`; render `PrepareModal` and assert the exact message string
    - **Validates: Requirements 3.2**

  - [~] 9.4 Write property test — Property 4: Policy selection is reflected correctly for any valid policy option
    - Use `fc.constantFrom('mode_a_only', 'mode_b_only', 'both', 'qr_only')`; fire `onChange` and assert radio is checked
    - **Validates: Requirements 3.8**

  - [~] 9.5 Write property test — Property 5: Prepare confirmation passes the selected policy to the sync trigger
    - Use `fc.constantFrom('mode_a_only', 'mode_b_only', 'both', 'qr_only')`; interact with modal and assert `onConfirm` receives that exact value
    - **Validates: Requirements 3.9**

  - [~] 9.6 Write property tests — Properties 6 & 7: Mock API monotonicity and error threshold
    - Already covered in task 3.2 — cross-reference only; do not duplicate
    - _See task 3.2_

  - [~] 9.7 Write property test — Property 8: Progress percentage stays within [0, 100]
    - Use `fc.integer({ min: 1, max: 10000 })` for `total`; use `fc.integer({ min: 0 })` mapped to `synced ≤ total`
    - Assert `Math.min(100, Math.round((synced / total) * 100))` is always in `[0, 100]`
    - **Validates: Requirements 5.2**

  - [~] 9.8 Write property test — Property 9: Status text format for any synced/total values
    - Use `fc.nat()` for both `synced` and `total`; render `SyncProgressView` in syncing phase and assert exact text format
    - **Validates: Requirements 5.3**

  - [~] 9.9 Write property test — Property 10: Action buttons are disabled during active sync
    - Use `fc.nat()` for event id/totals; render `EventCard` with `syncState.phase === 'syncing'` and assert disabled attribute present on buttons
    - **Validates: Requirements 5.4, 8.8**

  - [~] 9.10 Write property test — Property 11: Buttons re-enabled on sync completion or failure
    - Use `fc.constantFrom('success', 'error')` for terminal phase; render `EventCard` and assert buttons no longer carry `disabled`
    - **Validates: Requirements 5.5**

  - [~] 9.11 Write property test — Property 12: Sync on one event does not disable buttons on other events
    - Use `fc.string()` for two distinct event IDs; set one to `syncing`, render second `EventCard`, assert buttons enabled
    - **Validates: Requirements 5.6**

  - [~] 9.12 Write property test — Property 13: Success callback transitions event status to prepared
    - Use `fc.constantFrom('not_prepared', 'prepared', 'live', null)` for prior status; trigger success callback via hook and assert `markPrepared` result
    - **Validates: Requirements 6.1**

  - [~] 9.13 Write property test — Property 14: Success message displays correct total attendee count
    - Use `fc.integer({ min: 1, max: 50000 })` for `total`; render `SyncProgressView` in success phase and assert the exact count in message
    - **Validates: Requirements 6.2**

  - [~] 9.14 Write property test — Property 15: Error callback freezes progress bar at failure percentage
    - Use `fc.integer({ min: 1 })` for `synced` ≤ `total`; render `SyncProgressView` in error phase and assert `ProgressBar` `percent` prop equals `Math.round((synced/total)*100)` and `frozen` is `true`
    - **Validates: Requirements 7.1**

  - [~] 9.15 Write property test — Property 16: Error message correctly computes failed count
    - Use `fc.integer({ min: 1 })` for synced and total; render `SyncProgressView` in error phase and assert `failed = total − synced` appears in the message
    - **Validates: Requirements 7.2**

  - [~] 9.16 Write property test — Property 17: Retry button present whenever phase is error
    - Use `fc.nat()` for `synced` and `total`; render `SyncProgressView` in error phase and assert "Retry" button is in the DOM
    - **Validates: Requirements 7.4**

  - [~] 9.17 Write property test — Property 18: Retry resets visual progress to 0% and reuses original policy
    - Use `fc.constantFrom('mode_a_only', 'mode_b_only', 'both', 'qr_only')`; assert `SYNC_RETRY` reducer action resets `synced` to 0 and stored `policy` is unchanged
    - **Validates: Requirements 7.5**

  - [~] 9.18 Write property test — Property 19: Error callback does not change event status
    - Use `fc.constantFrom('not_prepared', 'prepared', 'live')` for prior status; dispatch `SYNC_ERROR` and assert `useEventStatus` state is unchanged
    - **Validates: Requirements 7.6, 8.7**

  - [~] 9.19 Write property test — Property 20: Re-sync passes the same policy as first-time sync
    - Use `fc.constantFrom('mode_a_only', 'mode_b_only', 'both', 'qr_only')` for original policy; simulate re-sync flow and assert `mockPrepareCheckin` is called with that policy
    - **Validates: Requirements 8.6**

- [~] 10. Final checkpoint — full test suite green
  - Run `npx vitest --run` and confirm all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover unit and property-based tests
- Each task references specific requirements for full traceability
- Checkpoints (tasks 7 and 10) ensure incremental validation
- Property tests (task 9) use **fast-check** and validate the 20 correctness properties defined in the design document
- Unit tests (tasks 3.3, 4.2, 8.1–8.5) use **Vitest** + **React Testing Library**
- The Mock API (`mockCheckinApi.js`) is the only backend interaction surface — no real `fetch` calls anywhere
- `cancelRefs` in `Dashboard` is the only mutable ref; it must be cleaned up on component unmount to prevent stale-callback React warnings
- `useSyncState` uses `useReducer` (not multiple `useState`) to prevent partial-state renders during rapid callback sequences

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.5", "2.6"] },
    { "id": 2, "tasks": ["2.4", "3.1", "4.3", "4.4", "4.5"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["5.6", "8.1", "8.2", "8.3", "8.4", "8.5", "9.7", "9.8"] },
    { "id": 6, "tasks": ["5.7", "9.3", "9.4", "9.5"] },
    { "id": 7, "tasks": ["6.1", "9.1", "9.2", "9.9", "9.10", "9.11", "9.14", "9.15", "9.16", "9.17", "9.18"] },
    { "id": 8, "tasks": ["6.2", "9.12", "9.13", "9.19"] }
  ]
}
```
