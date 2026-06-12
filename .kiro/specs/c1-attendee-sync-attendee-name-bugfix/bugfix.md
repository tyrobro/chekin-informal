# Bugfix Requirements Document

## Introduction

`AttendeeDTO::fromApiResponse()` reads identity fields (`attendee_name`, `ticket_type`,
`company`, `designation`, `seat`) as flat top-level keys on the raw record.  
The real ExplaraX Payments API returns these values **nested inside an `account` object**
(e.g. `$data['account']['name']`), not at the top level.

As a result every DTO built from a live API response has `attendee_name === ""` and
potentially empty/null values for the other identity fields, making the synced attendee
list useless for check-in.

The fix must update the field-resolution logic to read from the nested `account` structure
while keeping backward compatibility with the flat-key shape already used in existing tests.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the raw API record has the real ExplaraX shape `{ "ticket_id": 86, "account": { "name": "Pankaj Kumar", "ticket_type": "VIP", "company": "Acme", "designation": "CTO", "seat": "B3" } }` THEN the system sets `attendee_name` to `""` because it reads the non-existent flat key `$data['attendee_name']`

1.2 WHEN the raw API record carries `ticket_type`, `company`, `designation`, or `seat` inside the `account` sub-object rather than at the top level THEN the system sets those fields to `null` instead of the actual values

### Expected Behavior (Correct)

2.1 WHEN the raw API record has the real ExplaraX shape with `account.name` present THEN the system SHALL resolve `attendee_name` from `$data['account']['name']`, producing a non-empty string equal to the nested name value

2.2 WHEN the raw API record carries `ticket_type`, `company`, `designation`, or `seat` inside the `account` sub-object THEN the system SHALL resolve each field from the nested `account` key, falling back to the top-level key when the nested key is absent, so that no identity field is lost from live API data

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the raw API record uses the legacy flat shape `{ "ticket_id": "T1", "attendee_name": "Test User", "ticket_type": "General", ... }` (as used in existing unit tests) THEN the system SHALL CONTINUE TO populate all DTO fields correctly from the flat keys

3.2 WHEN a raw API record contains PII fields such as `email`, `phone`, or `payment_*` at any nesting level THEN the system SHALL CONTINUE TO exclude those fields from the resulting `AttendeeDTO`

3.3 WHEN the raw API record is otherwise valid (correct `ticket_id`, parseable fields) THEN the system SHALL CONTINUE TO produce an `AttendeeDTO` instance with the same `ticket_id` and `event_id` values as before
