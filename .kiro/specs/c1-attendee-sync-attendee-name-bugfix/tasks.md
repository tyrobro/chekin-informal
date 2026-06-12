# Implementation Plan

## Overview

Fix `AttendeeDTO::fromApiResponse()` to resolve identity fields (`attendee_name`,
`ticket_type`, `company`, `designation`, `seat`) from the real ExplaraX API nested
`account` sub-object, with a flat-key fallback for backward compatibility.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] },
    { "wave": 3, "tasks": ["4"] }
  ]
}
```

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Nested Account Fields Are Mapped Correctly
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that `attendee_name` (and other identity fields) are empty/null when the real API nested shape is used
  - **Scoped PBT Approach**: Scope the property to the concrete confirmed failing case — `ticket_id=86` with `account.name="Pankaj Kumar"` — then broaden to all nested-shape records
  - Add a new test method `test_maps_attendee_name_from_nested_account_shape()` to `tests/Unit/AttendeeSync/HttpExplaraXAttendeeRepositoryTest.php`
  - Call `AttendeeDTO::fromApiResponse(204, $payload)` directly with the Tinker-confirmed payload: `['ticket_id' => 86, 'account' => ['name' => 'Pankaj Kumar']]`
  - Assert `$dto->attendee_name === 'Pankaj Kumar'`
  - Add a second assertion block with a fully-nested record: `account` containing `name`, `ticket_type`, `company`, `designation`, `seat`; assert all five identity fields are non-null and equal the nested values
  - Run test suite on **UNFIXED** code: `php artisan test --filter=test_maps_attendee_name_from_nested_account_shape`
  - **EXPECTED OUTCOME**: Test FAILS with `Failed asserting that '' is identical to 'Pankaj Kumar'` (or equivalent) — this proves the bug exists
  - Document the exact counterexample failure output before moving on
  - Mark task complete when test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Flat Shape Behaviour Is Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `AttendeeDTO::fromApiResponse(204, makeAttendee('T1'))` on unfixed code returns `attendee_name = 'Test User'`, `ticket_type = 'General'`, etc.
  - Observe: `AttendeeDTO::fromApiResponse(204, makeAttendee('T2', ['company' => null]))` returns `company = null` on unfixed code
  - Write a property-based test in `tests/Unit/AttendeeSync/AttendeeDTOPreservationTest.php` using PHPUnit data providers or a simple property loop:
    - Generate a representative set of flat-shape records (covering: all optional fields present, some null, all null)
    - For each record, call `fromApiResponse()` and assert the output matches the expected flat-shape mapping exactly
  - Cover PII strip preservation: flat record with `email`, `phone`, `payment_id` → DTO has none of those properties
  - Cover `ticket_id` and `event_id` pass-through: flat record → DTO `ticket_id` and `event_id` are always from top-level keys
  - Run preservation tests on **UNFIXED** code: `php artisan test --filter=AttendeeDTOPreservationTest`
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline flat-shape behaviour to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Fix nested field mapping in AttendeeDTO

  - [ ] 3.1 Implement the fix in `AttendeeDTO::fromApiResponse()`
    - Open `app/Features/AttendeeSync/DTOs/AttendeeDTO.php`
    - At the top of `fromApiResponse()`, extract the account sub-array: `$account = is_array($data['account'] ?? null) ? $data['account'] : [];`
    - Update `attendee_name` resolution to nested-first: `(string) ($account['name'] ?? $data['attendee_name'] ?? '')`
    - Update `ticket_type` resolution: `isset($account['ticket_type']) ? (string) $account['ticket_type'] : (isset($data['ticket_type']) ? (string) $data['ticket_type'] : null)`
    - Update `company` resolution with the same nested-first, flat-fallback pattern
    - Update `designation` resolution with the same pattern
    - Update `seat` resolution with the same pattern
    - Do NOT change `ticket_id`, `event_id`, or `metadata` — these remain top-level reads
    - Do NOT add any mapping for `email`, `phone`, or `payment_*` at any nesting level
    - _Bug_Condition: `isBugCondition(data)` where `data['account']` is a non-empty array and top-level identity keys are absent_
    - _Expected_Behavior: `dto->attendee_name = data['account']['name']`; all other identity fields from `data['account']` with flat fallback_
    - _Preservation: flat-shape records with top-level identity keys must produce identical DTO output as before_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [ ] 3.2 Add real-API-shape helper and integration coverage in `HttpExplaraXAttendeeRepositoryTest`
    - Add a `makeAttendeeNestedShape(string $ticketId, array $accountFields = []): array` private helper that returns the real API shape: `['ticket_id' => $ticketId, 'account' => array_merge(['name' => 'Test User', 'ticket_type' => 'General', 'company' => 'Acme', 'designation' => 'Engineer', 'seat' => 'A1'], $accountFields)]`
    - Add `test_fetches_attendees_with_nested_account_shape()`: fake HTTP with three nested-shape records, assert all three DTOs have the correct non-empty `attendee_name`, `ticket_type`, `company`, `designation`, `seat`
    - Add `test_pii_fields_are_stripped_from_nested_shape_dtos()`: nested-shape record with `account.email`, `account.phone` or top-level PII → DTO has no `email`, `phone`, `payment_id` properties
    - _Requirements: 2.1, 2.2, 3.2_

  - [ ] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Nested Account Fields Are Mapped Correctly
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Run: `php artisan test --filter=test_maps_attendee_name_from_nested_account_shape`
    - **EXPECTED OUTCOME**: Test PASSES — `attendee_name === 'Pankaj Kumar'` and all identity fields match nested values
    - _Requirements: 2.1, 2.2_

  - [ ] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Flat Shape Behaviour Is Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `php artisan test --filter=AttendeeDTOPreservationTest`
    - **EXPECTED OUTCOME**: Tests PASS — all flat-shape assertions still hold, confirming no regressions
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Checkpoint — Ensure all tests pass
  - Run the full AttendeeSync test suite: `php artisan test --group=c1-attendee-sync`
  - Verify the four new/updated tests all pass: `test_maps_attendee_name_from_nested_account_shape`, `AttendeeDTOPreservationTest`, `test_fetches_attendees_with_nested_account_shape`, `test_pii_fields_are_stripped_from_nested_shape_dtos`
  - Verify the four existing tests continue to pass unchanged: `test_fetches_all_attendees_from_single_page`, `test_fetches_all_pages_when_paginated`, `test_throws_on_non_2xx_response`, `test_pii_fields_are_stripped_from_dtos`
  - Ensure all tests pass; ask the user if questions arise

## Notes

- Write tasks 1 and 2 (exploration + preservation tests) **before** touching production code.
- Run task 1 on unfixed code first — the expected outcome is a **FAIL** that confirms the bug.
- Run task 2 on unfixed code — the expected outcome is **PASS** to capture the baseline.
- Only proceed to task 3 after both test suites are in place and their initial outcomes are documented.
- Do not map `email`, `phone`, or `payment_*` at any nesting level — this is a hard constraint from C1 spec.
- PHP 8.4 readonly DTO pattern must be preserved; do not add mutability or setters.
