# AttendeeDTO Nested Field Mapping Bugfix Design

## Overview

`AttendeeDTO::fromApiResponse()` assumes all identity fields are flat top-level keys.
The real ExplaraX Payments API wraps them in an `account` sub-object.
This mismatch causes `attendee_name` (and potentially `ticket_type`, `company`,
`designation`, `seat`) to be empty/null for every attendee fetched from the live API.

The fix adds a nested-first, flat-fallback resolution strategy to `fromApiResponse()`,
restoring correct field population without breaking existing tests that use the flat shape.

---

## Glossary

- **Bug_Condition (C)**: A raw API record where one or more identity fields exist only
  inside `$data['account']` and not at the top level.
- **Property (P)**: For any input satisfying C, `fromApiResponse()` returns an
  `AttendeeDTO` whose identity fields equal the values found in `$data['account']`.
- **Preservation**: The flat-key behaviour used by all existing unit tests must be
  completely unchanged — `fromApiResponse()` with a flat record must produce identical
  output before and after the fix.
- **`AttendeeDTO::fromApiResponse(int $eventId, array $data)`**: The static factory in
  `app/Features/AttendeeSync/DTOs/AttendeeDTO.php` responsible for mapping a raw
  ExplaraX API record to a typed DTO.
- **`account` sub-object**: The nested array at `$data['account']` that the real API
  returns; contains `name`, and potentially `ticket_type`, `company`, `designation`,
  `seat`.
- **flat shape**: Legacy / test fixture format where all fields live at `$data['field']`
  directly.

---

## Bug Details

### Bug Condition

The bug manifests when a raw record arrives from the real ExplaraX Payments API.
`fromApiResponse()` reads `$data['attendee_name']` which is `null` at the top level;
the actual name lives at `$data['account']['name']`.  The same mismatch likely affects
`ticket_type`, `company`, `designation`, and `seat`.

**Formal Specification:**

```
FUNCTION isBugCondition(data)
  INPUT: data of type array (one raw attendee record)
  OUTPUT: boolean

  account ← data['account'] ?? null

  RETURN account IS NOT NULL
         AND account IS array
         AND (
               data['attendee_name'] IS NULL
               OR data['ticket_type'] IS NULL
               OR data['company']     IS NULL
               OR data['designation'] IS NULL
               OR data['seat']        IS NULL
             )
END FUNCTION
```

### Examples

| Input shape | Field | Current result | Expected result |
|---|---|---|---|
| `{ "ticket_id": 86, "account": { "name": "Pankaj Kumar" } }` | `attendee_name` | `""` | `"Pankaj Kumar"` |
| `{ "ticket_id": 86, "account": { "name": "X", "ticket_type": "VIP" } }` | `ticket_type` | `null` | `"VIP"` |
| `{ "ticket_id": "T1", "attendee_name": "Test User", "ticket_type": "General" }` (flat) | `attendee_name` | `"Test User"` ✓ | `"Test User"` (unchanged) |
| `{ "ticket_id": 86, "account": {} }` (empty account) | `attendee_name` | `""` | `""` (graceful fallback) |

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Existing tests using the flat shape (`makeAttendee()` helper) must continue to pass
  without modification.
- PII exclusion (`email`, `phone`, `payment_*`) must remain unconditional at all nesting
  levels.
- `ticket_id` and `event_id` are always read from the top-level; this must not change.
- `metadata` is always read from the top-level `$data['metadata']`; this must not change.

**Scope:**
All records that do NOT satisfy `isBugCondition()` — i.e., records with flat identity
fields — must produce byte-for-byte identical `AttendeeDTO` instances before and after
the fix.  This covers:
- Flat fixture payloads in existing PHPUnit tests.
- Any integration path that posts flat records.

---

## Hypothesized Root Cause

1. **Static field-key assumption**: `fromApiResponse()` was authored against a flat API
   contract or an early API prototype.  When ExplaraX later wrapped identity data in an
   `account` object the mapping was never updated.

2. **No real-API integration test**: All existing tests use `makeAttendee()` which
   produces the flat shape, so the mismatch was never caught by CI.

3. **Silent null-coalescing**: `(string) ($data['attendee_name'] ?? '')` silently returns
   `""` instead of throwing, masking the bug until a real sync was run.

4. **Possible wider mismatch**: `ticket_type`, `company`, `designation`, `seat` may also
   live in `account`; the Tinker probe confirmed `$raw['attendee_name'] === null` and
   similar null results for the other flat keys, while `$raw['account']['name']` was
   confirmed present.

---

## Correctness Properties

Property 1: Bug Condition - Nested Account Fields Are Mapped Correctly

_For any_ raw record where `isBugCondition(data)` returns `true` (i.e., identity fields
are absent at the top level but present inside `data['account']`), the fixed
`fromApiResponse()` SHALL return an `AttendeeDTO` whose `attendee_name` equals
`data['account']['name']` and whose `ticket_type`, `company`, `designation`, and `seat`
each equal the corresponding value from `data['account']` when present.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Flat Shape Behaviour Is Unchanged

_For any_ raw record where `isBugCondition(data)` returns `false` (i.e., identity fields
are present at the top level in the flat shape), the fixed `fromApiResponse()` SHALL
produce the same `AttendeeDTO` as the original `fromApiResponse()`, preserving all field
values and the absence of PII fields.

**Validates: Requirements 3.1, 3.2, 3.3**

---

## Fix Implementation

### Changes Required

**File:** `app/Features/AttendeeSync/DTOs/AttendeeDTO.php`

**Method:** `AttendeeDTO::fromApiResponse()`

**Specific Changes:**

1. **Extract `account` sub-array early**: Read `$account = $data['account'] ?? []` at the
   top of the method so it is available for all identity-field lookups.

2. **Nested-first resolution for `attendee_name`**: Replace  
   `(string) ($data['attendee_name'] ?? '')` with  
   `(string) ($account['name'] ?? $data['attendee_name'] ?? '')`.

3. **Nested-first resolution for `ticket_type`**: Replace the current lookup with  
   `$account['ticket_type'] ?? $data['ticket_type'] ?? null`, cast to `string|null`.

4. **Nested-first resolution for `company`**: Apply the same nested-first pattern using
   `$account['company'] ?? $data['company'] ?? null`.

5. **Nested-first resolution for `designation`**: Apply using
   `$account['designation'] ?? $data['designation'] ?? null`.

6. **Nested-first resolution for `seat`**: Apply using
   `$account['seat'] ?? $data['seat'] ?? null`.

7. **No changes to `ticket_id`, `event_id`, or `metadata`**: These remain top-level reads
   only.

**File:** `tests/Unit/AttendeeSync/HttpExplaraXAttendeeRepositoryTest.php`

8. **Add `makeAttendeeNestedShape()` helper** (or `makeAttendee()` overload) that returns
   the real API shape with an `account` sub-object.

9. **Add a dedicated test** `test_maps_attendee_name_from_nested_account_shape()` that
   calls `AttendeeDTO::fromApiResponse()` directly with the exact Tinker-confirmed payload
   `{ "ticket_id": 86, "account": { "name": "Pankaj Kumar" } }` and asserts
   `attendee_name === "Pankaj Kumar"`.

---

## Testing Strategy

### Validation Approach

Two-phase approach:
1. Write tests against **unfixed** code first to confirm they fail (proving the bug).
2. Implement the fix, then verify the same tests pass and preservation tests still pass.

---

### Exploratory Bug Condition Checking

**Goal:** Surface counterexamples that demonstrate the bug BEFORE implementing the fix.
Confirm the root cause (`account.name` is never read).

**Test Plan:** Call `AttendeeDTO::fromApiResponse()` directly with the confirmed real API
payload and assert `attendee_name` equals the nested name.  Run on UNFIXED code — the
assertion will fail with `""` vs `"Pankaj Kumar"`.

**Test Cases:**

1. **Nested name only** — `{ "ticket_id": 86, "account": { "name": "Pankaj Kumar" } }`
   → assert `attendee_name === "Pankaj Kumar"` (will fail on unfixed code)
2. **Nested all identity fields** —
   `{ "ticket_id": 86, "account": { "name": "X", "ticket_type": "VIP", "company": "Acme", "designation": "CTO", "seat": "B3" } }`
   → assert each field maps correctly (will fail on unfixed code)
3. **Nested name, flat fallback fields** — mixed shape where `company` exists at top level
   but `name` is nested → assert both resolve correctly (may fail partially on unfixed code)
4. **Empty `account` array** — `{ "ticket_id": 86, "account": {} }`
   → assert `attendee_name === ""` gracefully (may or may not fail)

**Expected Counterexamples:**
- `attendee_name` is `""` instead of `"Pankaj Kumar"` for cases 1 and 2.
- `ticket_type`, `company`, `designation`, `seat` are `null` instead of their nested values.

---

### Fix Checking

**Goal:** Verify that for all inputs satisfying `isBugCondition()`, the fixed function
produces the expected values.

**Pseudocode:**

```
FOR ALL data WHERE isBugCondition(data) DO
  dto ← AttendeeDTO::fromApiResponse(eventId, data)
  ASSERT dto.attendee_name = data['account']['name']
  ASSERT dto.ticket_type   = data['account']['ticket_type'] ?? null
  ASSERT dto.company       = data['account']['company']     ?? null
  ASSERT dto.designation   = data['account']['designation'] ?? null
  ASSERT dto.seat          = data['account']['seat']        ?? null
END FOR
```

---

### Preservation Checking

**Goal:** Verify that for all inputs where `isBugCondition()` is false (flat shape),
the fixed `fromApiResponse()` produces the same output as the original.

**Pseudocode:**

```
FOR ALL data WHERE NOT isBugCondition(data) DO
  ASSERT fromApiResponse_original(eventId, data) = fromApiResponse_fixed(eventId, data)
END FOR
```

**Testing Approach:** Property-based testing is recommended here because it generates
many flat-shape records automatically (varying `ticket_id`, `attendee_name`, optional
fields) and provides strong guarantees that no flat-shape regression was introduced.

**Test Cases:**

1. **Flat shape — all fields present**: Existing `makeAttendee()` fixtures → all pass
   unchanged.
2. **Flat shape — optional fields null**: `attendee_name` present, `company` absent → same
   DTO as before.
3. **Flat shape — PII stripped**: PII keys in flat record remain absent from DTO.

---

### Unit Tests

- `AttendeeDTO::fromApiResponse()` with nested shape → all identity fields populated.
- `AttendeeDTO::fromApiResponse()` with flat shape → identical to current behaviour.
- `AttendeeDTO::fromApiResponse()` with mixed shape → nested wins over flat fallback.
- `AttendeeDTO::fromApiResponse()` with empty `account` → graceful fallback to flat/empty.
- PII exclusion unchanged for nested shape.

### Property-Based Tests

- Generate random flat attendee arrays (varying all optional fields); assert fixed output
  equals original output for all of them (preservation property).
- Generate random nested-account arrays satisfying `isBugCondition()`; assert each
  identity field in the resulting DTO equals its counterpart in `account`.

### Integration Tests

- `HttpExplaraXAttendeeRepository::fetchAllForEvent()` with a faked HTTP response using
  the real nested shape → resulting DTOs have correct non-empty `attendee_name`.
- Re-sync test: existing `test_fetches_all_attendees_from_single_page()` continues to
  pass after the fix (uses flat shape via `makeAttendee()`).
