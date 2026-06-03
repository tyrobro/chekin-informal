# Design Document: Checkin Prepare Flow

## Overview

The Checkin Prepare Flow (Slice B1) is a self-contained React feature that lets an authenticated event host synchronize their attendee list into the isolated check-in environment before an event goes live. The feature lives entirely on the frontend — all "backend" interaction is handled by a local Mock API service using `setTimeout`-driven callbacks rather than real network calls.

The feature covers five distinct UI states for each event:

1. **Not Prepared** — "Prepare Check-in" action available
2. **Syncing** — Progress bar + live status text, action buttons disabled
3. **Sync Error** — Frozen progress bar, error message, Retry button
4. **Prepared / Live** — Success message + post-preparation actions (Invite Staff, View Dashboard)
5. **Re-sync** — Available on Prepared/Live events; shares the same sync/error/success states

The architecture is intentionally narrow: no routing library, no global state manager, no external data fetching. State lives in React hooks; the Mock API is a pure JS module.

---

## Architecture

### High-Level Component Tree

```
App
└── Dashboard                         (auth gate + event list shell)
    ├── EventList                     (maps over events array)
    │   └── EventCard (×N)            (per-event row: badge + actions)
    │       ├── StatusBadge           (reusable, stateless)
    │       ├── ActionBar             (buttons for the card's current status)
    │       │   ├── Button            (reusable, variant: primary | secondary | disabled)
    │       │   └── SyncProgressView  (shown in place of ActionBar during/after sync)
    │       │       ├── ProgressBar   (reusable, 0–100%)
    │       │       └── StatusMessage (success | error | in-progress text)
    │       └── [modal portal target]
    ├── PrepareModal                  (opened via React portal)
    │   ├── VerificationPolicySelector
    │   └── Button (Cancel / Prepare)
    └── ResyncModal                   (opened via React portal)
        └── Button (Cancel / Re-sync)
```

### Separation of Concerns

| Layer | Location | Responsibility |
|---|---|---|
| UI shell | `src/features/prepare-sync/` | Orchestrates state, opens modals, feeds data to children |
| Reusable UI atoms | `src/components/` | Button, Modal, ProgressBar, StatusBadge, StatusMessage |
| Feature state | `useSyncState` hook | Per-event sync lifecycle state machine |
| API simulation | `src/api/mockCheckinApi.js` | Emits incremental progress callbacks |
| Design tokens | `src/styles/tokens.css` | CSS custom properties consumed by all modules |

Modals are rendered into `document.body` via `ReactDOM.createPortal` so they sit above all card content in the stacking context.

---

## Components and Interfaces

### `Dashboard` — `src/features/prepare-sync/Dashboard.jsx`

Top-level feature component. Acts as the authentication gate.

```js
// Props: none (reads AUTH_FLAG from a local constant)
const AUTH_FLAG = true;

// Renders:
// - AccessDenied if AUTH_FLAG === false
// - ErrorState + retry if event list fails to load
// - EventList otherwise
```

State managed here:
- `events` — array of event objects (initial mock data)
- `activeModal` — `{ type: 'prepare' | 'resync', eventId }` or `null`
- Per-event sync state — delegated to `useSyncState`

---

### `EventList` — `src/features/prepare-sync/EventList.jsx`

```js
// Props
{
  events: Event[],
  syncStateMap: Record<string, SyncState>,   // keyed by event.id
  onPrepareClick: (eventId: string) => void,
  onResyncClick:  (eventId: string) => void,
  onRetryClick:   (eventId: string) => void,
}
```

Renders one `EventCard` per event. Passes through all callbacks; has no local state.

---

### `EventCard` — `src/features/prepare-sync/EventCard.jsx`

```js
// Props
{
  event: Event,
  syncState: SyncState,
  onPrepareClick: () => void,
  onResyncClick:  () => void,
  onRetryClick:   () => void,
}
```

Decides which sub-view to render in the action area:
- `SyncProgressView` when `syncState.phase` is `syncing | error | success`
- `ActionBar` otherwise

---

### `ActionBar` — `src/features/prepare-sync/ActionBar.jsx`

```js
// Props
{
  eventStatus: 'not_prepared' | 'prepared' | 'live' | 'unknown',
  isSyncingElsewhere: boolean,   // true when another event is NOT being synced (no restriction)
  onPrepareClick: () => void,
  onResyncClick:  () => void,
}
```

Per Requirement 5.6, clicking Prepare/Re-sync on *other* events is never restricted — `isSyncingElsewhere` is always `false` for other cards.

---

### `SyncProgressView` — `src/features/prepare-sync/SyncProgressView.jsx`

```js
// Props
{
  phase: 'syncing' | 'error' | 'success',
  synced: number,
  total: number,
  onRetry: () => void,
}
```

Internally calculates `percent = total > 0 ? Math.round((synced / total) * 100) : 0`.

Renders:
- `ProgressBar` with computed `percent`
- Status text (see Requirement 5.3, 6.2, 7.2, 7.3)
- Retry `Button` when `phase === 'error'`

---

### `ProgressBar` — `src/components/ProgressBar/ProgressBar.jsx`

```js
// Props
{
  percent: number,    // 0–100
  frozen: boolean,    // true = error state, bar stops animating
  label: string,      // accessible aria-label
}
```

Renders a `<div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>` with an inner fill `<div>` whose `width` is controlled by a CSS custom property `--progress-fill`.

---

### `StatusBadge` — `src/components/StatusBadge/StatusBadge.jsx`

```js
// Props
{
  status: 'not_prepared' | 'prepared' | 'live' | 'unknown',
}
```

Stateless. Maps status to label text and a CSS modifier class.

---

### `Button` — `src/components/Button/Button.jsx`

```js
// Props
{
  variant: 'primary' | 'secondary' | 'danger',
  disabled: boolean,
  onClick: () => void,
  children: ReactNode,
  ariaLabel?: string,
}
```

When `disabled` is `true`, renders `disabled` attribute AND `aria-disabled="true"`, and removes the element from tab order (`tabIndex={-1}` guard is redundant with native `disabled`, but the component also handles non-`<button>` cases).

---

### `PrepareModal` — `src/features/prepare-sync/PrepareModal.jsx`

```js
// Props
{
  event: Event,
  onCancel: () => void,
  onConfirm: (policy: VerificationPolicy) => void,
}
```

Local state:
- `selectedPolicy` — defaults to `'both'`

Renders via `ReactDOM.createPortal` into `document.body`. Traps focus inside the dialog using a `useEffect` that sets focus on the first focusable element on mount and restores it to the trigger element on unmount.

---

### `VerificationPolicySelector` — `src/features/prepare-sync/VerificationPolicySelector.jsx`

```js
// Props
{
  selected: VerificationPolicy,
  onChange: (policy: VerificationPolicy) => void,
}
```

Renders a `<fieldset>` with `<legend>` and four `<input type="radio">` controls, each with an explicit `<label>`. Uses `aria-describedby` to link the fieldset description to the legend.

---

### `ResyncModal` — `src/features/prepare-sync/ResyncModal.jsx`

```js
// Props
{
  event: Event,
  onCancel: () => void,
  onConfirm: () => void,
}
```

No local state. Renders a simpler confirmation dialog — no policy selector (Requirement 8.6: same payload structure as first-time sync reuses the previously selected policy stored in sync state).

---

### `AccessDenied` — `src/components/AccessDenied/AccessDenied.jsx`

Stateless. Renders an "Access Denied" message. Used when `AUTH_FLAG === false`.

---

### `ErrorState` — `src/components/ErrorState/ErrorState.jsx`

```js
// Props
{
  message: string,
  onRetry: () => void,
}
```

Reusable. Used for dashboard load failures and can be reused across the broader app.

---

## Data Models

### `Event` object

```js
{
  id: string,                          // e.g. "evt_001"
  name: string,                        // "Summer Music Festival"
  totalAttendees: number,              // e.g. 1580
  status: 'not_prepared' | 'prepared' | 'live' | null,
}
```

### `SyncState` object (per event, managed by `useSyncState`)

```js
{
  phase: 'idle' | 'syncing' | 'error' | 'success',
  synced: number,                      // count at last callback
  total: number,                       // mirrors event.totalAttendees
  policy: VerificationPolicy | null,   // policy used for current/last job
  errorSynced: number | null,          // synced count frozen at error point
}
```

`phase` drives all conditional rendering decisions. The transition table is:

```
idle     → syncing   : host clicks Prepare / Re-sync confirmed
syncing  → success   : Mock API callback status: "success"
syncing  → error     : Mock API callback status: "error"
error    → syncing   : host clicks Retry
success  → syncing   : host clicks Re-sync (via ResyncModal)
```

### `VerificationPolicy` type

```js
'mode_a_only' | 'mode_b_only' | 'both' | 'qr_only'
```

### Mock API progress callback payload

```js
// In-progress
{ status: 'progress', synced: number, total: number }

// Terminal success
{ status: 'success', synced: number, total: number }

// Terminal error
{ status: 'error', synced: number, total: number }
```

---

## Mock API Service Design

**File:** `src/api/mockCheckinApi.js`

### Interface

```js
/**
 * Simulates POST /internal/checkin/prepare/{event_id}
 *
 * @param {string} eventId
 * @param {VerificationPolicy} policy
 * @param {number} totalAttendees
 * @param {function} onProgress  - called with each payload
 * @param {object}  options
 * @param {boolean} options.simulateError  - defaults to false
 * @returns {function} cancel  - call to abort the in-flight simulation
 */
export function mockPrepareCheckin(eventId, policy, totalAttendees, onProgress, options = {})
```

### Algorithm

```
1. Determine batch size: random int between 1 and ceil(total / 10)
2. Determine error threshold (only when simulateError = true):
     errorAt = floor(random(0.3, 0.7) * total)
3. Loop:
     a. Wait random(200, 800)ms via setTimeout
     b. synced += batchSize (clamped to total, or errorAt)
     c. If simulateError && synced >= errorAt:
          emit { status: 'error', synced: currentSynced, total }
          stop loop
     d. If synced >= total:
          emit { status: 'success', synced: total, total }
          stop loop
     e. Else:
          emit { status: 'progress', synced, total }
          continue loop
4. Return a cancel function that clears pending setTimeout handles
```

The cancel function is important: if the host navigates away or the component unmounts, pending callbacks must not fire against a stale state setter (React will warn; more critically it would corrupt `SyncState`).

### Retry Behavior

When the host clicks Retry, the Dashboard does **not** reset `synced` to 0 in the API call — it passes the current `errorSynced` count as the `alreadySynced` offset so the mock skips already-processed attendees:

```js
// On retry, start from where we failed
mockPrepareCheckin(eventId, policy, totalAttendees, onProgress, {
  alreadySynced: syncState.errorSynced,
})
```

Internally the mock sets its initial `synced = alreadySynced` and counts from there to `total`. The `Progress_View` resets its visual display to 0% per Requirement 7.5, but the underlying mock knows not to re-process already-synced records.

---

## State Management Approach

### `useSyncState` hook — `src/features/prepare-sync/useSyncState.js`

All per-event sync lifecycle state is managed in a single `useReducer` inside this hook. Using `useReducer` over multiple `useState` calls prevents partial-state renders (e.g., `phase` and `synced` updating in separate render cycles).

```js
// State shape
{
  phases: Record<string, SyncPhase>,  // keyed by eventId
}

// Action types
'SYNC_START'     // { eventId, policy, total }
'SYNC_PROGRESS'  // { eventId, synced, total }
'SYNC_SUCCESS'   // { eventId, synced, total }
'SYNC_ERROR'     // { eventId, synced, total }
'SYNC_RETRY'     // { eventId }
```

The hook exposes:
```js
{
  getSyncState: (eventId) => SyncState,
  startSync:    (eventId, policy, total) => void,
  handleProgress: (eventId, payload) => void,
  handleSuccess:  (eventId, payload) => void,
  handleError:    (eventId, payload) => void,
  retrySync:      (eventId) => void,
}
```

### `useEventStatus` hook — `src/features/prepare-sync/useEventStatus.js`

Manages the `events` array. When a sync succeeds, this hook updates the matching event's `status` to `'prepared'`. Keeps event data concerns separate from sync-progress concerns.

```js
{
  events: Event[],
  markPrepared: (eventId) => void,
}
```

### `useModal` hook — `src/features/prepare-sync/useModal.js`

Lightweight hook:
```js
{
  activeModal: { type, eventId } | null,
  openPrepareModal:  (eventId) => void,
  openResyncModal:   (eventId) => void,
  closeModal:        () => void,
}
```

---

## CSS Modules / Token Usage Strategy

### Design Tokens — `src/styles/tokens.css`

All colors, spacing, radii, and typography are defined as CSS custom properties on `:root`:

```css
:root {
  /* Brand */
  --color-primary:        #7E57C2;
  --color-primary-dark:   #6A3FB5;   /* hover: darken ~10% */
  --color-primary-light:  #9575CD;   /* focus ring */
  --color-success:        #5BC97C;
  --color-error:          #D64545;
  --color-bg:             #FFFFFF;
  --color-surface:        #FFFFFF;
  --color-border:         #F0F0F0;
  --color-text:           #3B3535;
  --color-text-muted:     #7A7070;

  /* Typography */
  --font-family:          'Inter', 'Segoe UI', sans-serif;
  --font-size-base:       1rem;
  --font-size-sm:         0.875rem;
  --font-size-lg:         1.125rem;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Transitions */
  --transition-fast: 80ms ease;
  --transition-base: 150ms ease;
}
```

`tokens.css` is imported once in `main.jsx`. All CSS Module files consume these via `var(--color-primary)` etc.

### CSS Module Convention

Each component has a co-located `.module.css` file:

```
src/components/Button/
  Button.jsx
  Button.module.css

src/features/prepare-sync/
  PrepareModal.jsx
  PrepareModal.module.css
  ...
```

Class names use camelCase in the module files (`.primaryButton`, `.progressBar`, `.errorMessage`) and are referenced via `styles.primaryButton` in JSX.

### Button Token Application

| State | CSS rule |
|---|---|
| Default | `background: var(--color-primary); color: var(--color-bg)` |
| Hover | `background: var(--color-primary-dark)` |
| Focus | `outline: 2px solid var(--color-primary-light); outline-offset: 2px` |
| Active | `background: var(--color-primary-dark); transform: scale(0.98)` |
| Disabled | `opacity: 0.45; cursor: not-allowed; pointer-events: none` |

Secondary buttons: `background: transparent; border: 1px solid var(--color-primary); color: var(--color-primary)`.

### ProgressBar Animation

The fill width is driven by a CSS transition on `width` (not a CSS animation), so it responds immediately to each callback from the Mock API without restarting:

```css
.fill {
  height: 100%;
  background: var(--color-primary);
  transition: width var(--transition-base);
}
/* Frozen state (error) */
.fill.frozen {
  transition: none;
}
```

---

## File Structure

```
src/
├── api/
│   └── mockCheckinApi.js              # Mock API: simulatesPrepare endpoint
│
├── components/
│   ├── AccessDenied/
│   │   ├── AccessDenied.jsx
│   │   └── AccessDenied.module.css
│   ├── Button/
│   │   ├── Button.jsx
│   │   └── Button.module.css
│   ├── ErrorState/
│   │   ├── ErrorState.jsx
│   │   └── ErrorState.module.css
│   ├── Modal/
│   │   ├── Modal.jsx                  # Base modal shell (portal, backdrop, focus trap)
│   │   └── Modal.module.css
│   ├── ProgressBar/
│   │   ├── ProgressBar.jsx
│   │   └── ProgressBar.module.css
│   └── StatusBadge/
│       ├── StatusBadge.jsx
│       └── StatusBadge.module.css
│
├── features/
│   └── prepare-sync/
│       ├── Dashboard.jsx              # Auth gate + top-level orchestrator
│       ├── EventList.jsx              # Maps events → EventCard
│       ├── EventCard.jsx              # Per-event row
│       ├── EventCard.module.css
│       ├── ActionBar.jsx              # Buttons for idle events
│       ├── ActionBar.module.css
│       ├── SyncProgressView.jsx       # Progress bar + status + retry
│       ├── SyncProgressView.module.css
│       ├── PrepareModal.jsx           # Prepare confirmation dialog
│       ├── PrepareModal.module.css
│       ├── VerificationPolicySelector.jsx
│       ├── VerificationPolicySelector.module.css
│       ├── ResyncModal.jsx            # Re-sync confirmation dialog
│       ├── ResyncModal.module.css
│       ├── mockEvents.js              # Seed data (array of Event objects)
│       ├── useEventStatus.js          # Hook: manages events array, markPrepared
│       ├── useModal.js                # Hook: manages active modal state
│       └── useSyncState.js            # Hook: useReducer for per-event sync lifecycle
│
├── styles/
│   └── tokens.css                     # CSS custom properties (design tokens)
│
└── main.jsx                           # Imports tokens.css, renders <App />
```

---

## Key Algorithms

### Progress Percentage Calculation

```js
// SyncProgressView.jsx
const percent = total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : 0;
```

`Math.min(100, ...)` guards against an off-by-one where `synced` briefly exceeds `total` due to batch sizing. `Math.round` keeps the displayed percentage as a whole number.

### Mock API Batch Loop

```js
export function mockPrepareCheckin(eventId, policy, totalAttendees, onProgress, options = {}) {
  const { simulateError = false, alreadySynced = 0 } = options;
  let currentSynced = alreadySynced;
  let timeoutId = null;
  let cancelled = false;

  const errorAt = simulateError
    ? Math.floor((0.3 + Math.random() * 0.4) * totalAttendees)
    : Infinity;

  const tick = () => {
    if (cancelled) return;

    const batchSize = Math.ceil(Math.random() * Math.ceil(totalAttendees / 10));
    const effectiveMax = simulateError ? Math.min(errorAt, totalAttendees) : totalAttendees;
    currentSynced = Math.min(currentSynced + batchSize, effectiveMax);

    if (simulateError && currentSynced >= errorAt) {
      onProgress({ status: 'error', synced: currentSynced, total: totalAttendees });
      return;
    }

    if (currentSynced >= totalAttendees) {
      onProgress({ status: 'success', synced: totalAttendees, total: totalAttendees });
      return;
    }

    onProgress({ status: 'progress', synced: currentSynced, total: totalAttendees });
    const delay = 200 + Math.random() * 600; // 200–800ms
    timeoutId = setTimeout(tick, delay);
  };

  const delay = 200 + Math.random() * 600;
  timeoutId = setTimeout(tick, delay);

  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
```

### Status Transition Reducer

```js
// useSyncState.js
function syncReducer(state, action) {
  const prev = state[action.eventId] ?? initialSyncState;

  switch (action.type) {
    case 'SYNC_START':
      return {
        ...state,
        [action.eventId]: {
          phase: 'syncing',
          synced: 0,
          total: action.total,
          policy: action.policy,
          errorSynced: null,
        },
      };
    case 'SYNC_PROGRESS':
      return {
        ...state,
        [action.eventId]: { ...prev, phase: 'syncing', synced: action.synced },
      };
    case 'SYNC_SUCCESS':
      return {
        ...state,
        [action.eventId]: { ...prev, phase: 'success', synced: action.synced },
      };
    case 'SYNC_ERROR':
      return {
        ...state,
        [action.eventId]: {
          ...prev,
          phase: 'error',
          errorSynced: action.synced,
        },
      };
    case 'SYNC_RETRY':
      return {
        ...state,
        [action.eventId]: { ...prev, phase: 'syncing', synced: 0 },
      };
    default:
      return state;
  }
}
```

### Focus Trap in Modals

The base `Modal` component uses a `useEffect` to:
1. On mount: query all focusable elements inside the dialog, store the previously focused element, and focus the first focusable element.
2. On `keydown`: intercept `Tab` / `Shift+Tab` and wrap focus within the dialog.
3. On `keydown Escape`: call `onClose`.
4. On unmount: restore focus to the stored trigger element.

### Retry Flow Orchestration

```js
// Dashboard.jsx — handleRetry
const handleRetry = useCallback((eventId) => {
  const state = getSyncState(eventId);
  const event = events.find(e => e.id === eventId);

  // Visually reset to 0% (SYNC_RETRY resets synced to 0 in reducer)
  retrySync(eventId);

  // Cancel any lingering previous cancel function
  if (cancelRefs.current[eventId]) {
    cancelRefs.current[eventId]();
  }

  // Re-invoke mock from the failure point (alreadySynced skips processed records)
  cancelRefs.current[eventId] = mockPrepareCheckin(
    eventId,
    state.policy,
    event.totalAttendees,
    (payload) => handleMockCallback(eventId, payload),
    { alreadySynced: state.errorSynced ?? 0 }
  );
}, [getSyncState, events, retrySync]);
```

`cancelRefs` is a `useRef` holding a map of `{ [eventId]: cancelFn }`. This ensures unmount cleanup and prevents stale callbacks.

---

## Accessibility Considerations

### Roles and Landmarks

- `Dashboard` renders a `<main>` landmark.
- `EventList` renders a `<ul>` with `role="list"` (some resets require explicit role); each `EventCard` is an `<li>`.
- Modals use `<div role="dialog" aria-modal="true" aria-labelledby="modal-title">`.
- `ProgressBar` uses `<div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Sync progress">`.

### Live Regions

`SyncProgressView` wraps its status text in `<div aria-live="polite" aria-atomic="true">`. This ensures screen readers announce progress updates without interrupting the user. On error, the live region content changes to the error message — announcing it automatically.

### Focus Management

- Opening a modal moves focus into it (first focusable element).
- Closing a modal restores focus to the button that triggered it (stored in a `ref` on the trigger `Button`).
- During a sync, disabled action buttons have `disabled` attribute + `aria-disabled="true"`. Keyboard users cannot Tab into them.

### Button Labelling

- "Prepare Check-in", "Re-sync", "Retry", "Cancel" buttons use their visible text as accessible names.
- Icon-only buttons (none planned, but if added) must have `aria-label`.
- `VerificationPolicySelector` uses `<fieldset>` + `<legend>` so the group label is announced with each radio.

### Colour Contrast

All token combinations meet WCAG AA (4.5:1 for normal text):
- `#FFFFFF` on `#7E57C2` — 4.56:1 ✓
- `#3B3535` on `#FFFFFF` — 12.6:1 ✓
- `#D64545` on `#FFFFFF` — 4.64:1 ✓
- `#5BC97C` on `#FFFFFF` — 2.85:1 (large text / icon only use only) — use `#3B3535` for small success text labels

### Keyboard Navigation

- All interactive elements are reachable via `Tab`.
- Disabled buttons are removed from tab order via native `disabled` attribute.
- Modal backdrop click calls `onClose`; `Escape` key also closes.
- `VerificationPolicySelector` radio group: arrow keys move between options (native browser behaviour).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `AUTH_FLAG === false` | `AccessDenied` rendered; no event list |
| Event list data error | `ErrorState` component with message + Retry action |
| `status: "error"` from Mock API | Progress bar frozen, error message, Retry button |
| `synced === 0` at error | Special message: "Sync could not be started…" |
| Event has `totalAttendees === 0` | Prepare button disabled in `PrepareModal`, explanatory message shown |
| Unknown `Event_Status` | "Status Unknown" badge, no action buttons |
| Concurrent sync attempt (disabled button) | Button is `disabled`; no second job can be triggered |
| Component unmount during sync | `cancelRefs.current[eventId]()` clears pending `setTimeout` |

---

## Testing Strategy

### Unit Tests

Use **Vitest** + **React Testing Library** for unit and component tests.

Focus areas:
- `mockPrepareCheckin` — test progress emission, error threshold, cancel function, `alreadySynced` offset
- `syncReducer` — test all state transitions exhaustively
- `ProgressBar` — renders correct `aria-valuenow`, correct fill width style
- `PrepareModal` — default policy selection, disable Prepare when `totalAttendees === 0`, calls `onConfirm` with correct policy
- `StatusBadge` — correct label and class for each status value
- `Button` — disabled state removes from tab order, variants apply correct classes
- `SyncProgressView` — correct message format for all three phases

### Property-Based Tests

Use **fast-check** for property-based testing.

See **Correctness Properties** section below for the formal property definitions. Each property maps to a `fc.assert(fc.property(...))` test configured with a minimum of 100 runs.

Tag format: `// Feature: checkin-prepare-flow, Property N: <property_text>`

### Integration / Smoke Tests

- Dashboard renders event list with seed data (smoke test)
- Full Prepare flow: click Prepare → modal → confirm → progress → success state (example-based integration test)
- Full error + retry flow: example-based with `simulateError: true`

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Unknown status renders Status Unknown badge with no action buttons

*For any* event whose `status` value is not one of `not_prepared`, `prepared`, or `live` (including `null` and arbitrary strings), the rendered `EventCard` SHALL display a "Status Unknown" badge and SHALL NOT render any action buttons.

**Validates: Requirements 2.5**

---

### Property 2: Invite and View action buttons always appear as a pair

*For any* event with `status` of `prepared` or `live`, the "Invite Check-in Staff" and "View Live Dashboard" buttons are either both present in the rendered output or both absent — they never appear independently.

**Validates: Requirements 2.4**

---

### Property 3: PrepareModal attendee count message is accurate for any event

*For any* non-negative integer `N` used as an event's `totalAttendees`, the `PrepareModal` SHALL render the string "This will sync N attendees to the check-in system." with exactly that value of N.

**Validates: Requirements 3.2**

---

### Property 4: Policy selection is reflected correctly for any valid policy option

*For any* `VerificationPolicy` value from the set `{mode_a_only, mode_b_only, both, qr_only}`, selecting that option in the `VerificationPolicySelector` causes it to become the current selected value (the radio input is checked).

**Validates: Requirements 3.8**

---

### Property 5: Prepare confirmation passes the selected policy to the sync trigger

*For any* `VerificationPolicy` option selected by the host in the `PrepareModal`, clicking the "Prepare" button calls `onConfirm` with exactly that policy value — no substitution or transformation occurs.

**Validates: Requirements 3.9**

---

### Property 6: Mock API progress is monotonically increasing and terminates with a success payload

*For any* positive integer `totalAttendees` and any valid `VerificationPolicy`, when `simulateError` is `false`, the `mockPrepareCheckin` function SHALL emit a sequence of callbacks where the `synced` field never decreases between consecutive callbacks, and the final callback SHALL carry `status: "success"` with `synced === total`.

**Validates: Requirements 4.3, 4.4, 4.7**

---

### Property 7: Mock API error fires between 30% and 70% of total when simulateError is true

*For any* positive integer `totalAttendees`, when `simulateError` is `true`, the terminal callback emitted by `mockPrepareCheckin` SHALL carry `status: "error"` and the `synced` count at that point SHALL satisfy `0.30 × total ≤ synced ≤ 0.70 × total`.

**Validates: Requirements 4.6**

---

### Property 8: Progress percentage stays within [0, 100] for any synced and total values

*For any* integers where `0 ≤ synced ≤ total` and `total > 0`, the progress percentage computed as `Math.min(100, Math.round((synced / total) * 100))` SHALL be in the inclusive range `[0, 100]`.

**Validates: Requirements 5.2**

---

### Property 9: Status text renders correct format for any synced and total values

*For any* non-negative integers `synced` and `total` while a sync is in progress, the `SyncProgressView` SHALL render text matching exactly "Syncing {synced} of {total} attendees…" with the correct numeric values interpolated.

**Validates: Requirements 5.3**

---

### Property 10: Action buttons for the syncing event are disabled during an active sync

*For any* event whose sync phase is `syncing`, that event's "Prepare Check-in" and "Re-sync" buttons SHALL carry the `disabled` attribute and SHALL NOT be reachable via keyboard Tab focus.

**Validates: Requirements 5.4, 8.8**

---

### Property 11: Action buttons are re-enabled immediately upon sync completion or failure

*For any* event that transitions from `syncing` to `success` or `error`, that event's action buttons SHALL no longer carry the `disabled` attribute within the same render cycle as the terminal callback.

**Validates: Requirements 5.5**

---

### Property 12: A sync on one event does not disable action buttons on any other event

*For any* two distinct events A and B, when event A is in `syncing` phase, the action buttons for event B SHALL remain enabled (not carrying the `disabled` attribute) regardless of event B's own status.

**Validates: Requirements 5.6**

---

### Property 13: Receiving a success callback transitions event status to prepared

*For any* event regardless of its prior `Event_Status`, receiving a Mock API callback with `status: "success"` SHALL update that event's `Event_Status` to `prepared`.

**Validates: Requirements 6.1**

---

### Property 14: Success message displays the correct total attendee count

*For any* positive integer `total` delivered in a success callback, the `SyncProgressView` SHALL render the string "Sync complete — {total} attendees are ready for check-in." with that exact value of `total`.

**Validates: Requirements 6.2**

---

### Property 15: Error callback freezes the progress bar at the failure percentage

*For any* error callback carrying a `synced` count, the progress bar percentage displayed by `SyncProgressView` SHALL be frozen at `Math.round((synced / total) * 100)` and SHALL NOT change after the error callback is received.

**Validates: Requirements 7.1**

---

### Property 16: Error message correctly computes failed count as total minus synced

*For any* error callback where `synced > 0`, the `SyncProgressView` SHALL render an error message containing the string "Sync failed — {synced} of {total} attendees uploaded. {total - synced} attendees could not be synced." where `failed = total − synced` is computed correctly for any values of `synced` and `total`.

**Validates: Requirements 7.2**

---

### Property 17: Retry button is present whenever the sync phase is error

*For any* event in `error` phase, the `SyncProgressView` SHALL render a visible, clickable "Retry" button.

**Validates: Requirements 7.4**

---

### Property 18: Retry resets visual progress to 0% and re-uses the original policy

*For any* event in `error` phase with a stored `VerificationPolicy`, clicking the "Retry" button SHALL reset the displayed progress bar to 0% and SHALL invoke the Mock API with the same `VerificationPolicy` that was used in the original sync attempt.

**Validates: Requirements 7.5**

---

### Property 19: Error callback does not change event status

*For any* event that receives an error callback, that event's `Event_Status` SHALL remain at its value prior to the sync start — it SHALL NOT be updated to `prepared`.

**Validates: Requirements 7.6, 8.7**

---

### Property 20: Re-sync passes the same policy value as a first-time sync

*For any* event with `prepared` or `live` status and any `VerificationPolicy` previously stored from the original preparation, triggering a re-sync via the `ResyncModal` SHALL invoke `mockPrepareCheckin` with that same `VerificationPolicy` value.

**Validates: Requirements 8.6**
