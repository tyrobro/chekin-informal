# ExplaraX Check-in Product Context

## Product Vision

ExplaraX Check-in is a standalone Progressive Web Application (PWA) that provides high-throughput, multi-gate event check-in without impacting the ExplaraX core platform.

The product must support:

* Fast QR-based check-in
* Manual attendee verification
* Real-time attendance visibility
* Independent infrastructure from ExplaraX Core
* Browser-based access with no installation required

## User Types

### Host Admin

Responsible for:

* Preparing events for check-in
* Inviting staff
* Monitoring live attendance
* Viewing post-event reports

### Check-in Staff

Responsible for:

* Scanning attendee QR codes
* Performing manual verification
* Processing attendee entry

### Event Guest

Passive participant who presents a QR code or identity proof.

## Product Principles

1. Fast check-in experience
2. Minimal clicks for staff
3. Clear visual feedback
4. Mobile-first design
5. Accessibility compliance
6. Security-first handling of attendee data
7. No unnecessary exposure of PII

## Iteration 1 Scope

### Included

* QR scanning
* Manual lookup
* Host dashboard
* Staff dashboard
* Event preparation
* Sync-back workflow
* Staff invitations
* Live dashboard
* Empty states
* Error states

### Excluded

* Offline mode
* Reconciliation
* Wallet passes
* Native mobile apps
* Handheld scanners
* Re-entry support

## UI Guidelines

Success actions must feel immediate.

Allowed results:

* Full-screen green state
* Auto dismiss

Denied results:

* Full-screen red state
* Manual dismiss

Empty states:

* Helpful explanation
* Clear next action

Error states:

* Explain issue
* Offer recovery path

The user should never be left wondering what to do next.

## Staff Authentication Model

Staff access requires both:

1. A valid invitation link
2. Valid staff credentials

Flow:

Invitation Email
→ Magic Link
→ Staff Login
→ Staff Session
→ Staff PWA

Invitation links alone do not grant access.

Invitation links are used only to identify the staff assignment and verify invitation validity.

Authentication is performed using email and password.

Goals:

- Prevent unauthorized access if invitation links are shared
- Support password-protected staff access
- Maintain gate-level assignment security