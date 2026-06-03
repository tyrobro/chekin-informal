# Product Overview

**ExplaraX Check-in (Slice B1: Host Dashboard)** is the control center for event organizers to manage their standalone check-in infrastructure. 

## Purpose

This workspace focuses on the **"Prepare Check-in"** flow. To protect the main ExplaraX database from heavy traffic during live events, the check-in system operates on an isolated Supabase environment. Slice B1 is the interface that allows event hosts to trigger the synchronization of their attendee list from the main ExplaraX core database into this isolated check-in environment before the event begins. 

## Key Goals

- **One-Click Sync:** Allow hosts to easily copy attendees to the check-in system.
- **Live Progress Tracking:** Display clear, non-blocking UI updates (e.g., "Syncing 247 of 1,580 attendees…").
- **Policy Configuration:** Enable hosts to choose manual verification rules for their gate staff (Mode A: Ticket ID, Mode B: ID Document, Both, or Neither).
- **Idempotent Re-syncs:** Allow hosts to re-sync if new tickets are sold, without overwriting existing check-ins.

## Target Users

- **Event Hosts / Admins:** Logged in via the existing ExplaraX Auth mechanism. They operate this dashboard from a desktop or laptop browser.

## Acceptance Criteria (Given/When/Then)

- **Given** a host views an event in "Not Prepared" status
  **When** the host clicks "Prepare Check-in"
  **Then** a modal opens with: 
  1. "This will sync [N] attendees to the check-in system."
  2. Manual verification policy: radio buttons for "Mode A only", "Mode B only", "Both (recommended)", "Neither (QR only)"
  3. "Cancel" / "Prepare" buttons

- **Given** the host confirms preparation
  **When** the Prepare button is tapped
  **Then** a job is triggered via `POST /internal/checkin/prepare/{event_id}` and a progress bar is shown: "Syncing 247 of 1,580 attendees…"

- **Given** the sync completes successfully
  **When** all attendees are uploaded
  **Then** the event status changes to "Prepared", and two new actions appear: "Invite Check-in Staff" and "View Live Dashboard"

- **Given** the sync fails partway
  **When** the failure is reported
  **Then** the progress bar pauses, an error shows the count of successes and failures, and a "Retry" button allows resuming

- **Given** an event is already "Prepared" or "Live"
  **When** the host clicks "Re-sync"
  **Then** a modal explains "Re-syncing will refresh attendee data with any new tickets sold. Existing check-ins are preserved." Confirm + Re-sync

- **Given** the host re-syncs
  **When** the job runs
  **Then** only new attendees (not already in Supabase) are added; existing attendees with check-in status are not touched. *(Note: UI must simply trigger the backend to handle this idempotency)*.

## Notes for AI Assistants

- **Strict UI Tokens:** You must use the ExplaraX brand guidelines. Primary accent is `#7E57C2`, success is `#5BC97C`, and error/deny is `#D64545`.
- **Scope Boundary:** This slice *only* handles the UI and the trigger payload. Do not build the backend sync mechanics or the live dashboard in this module.