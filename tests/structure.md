# ExplaraX Check-in Project Structure

## Frontend

src/

api/
authApi.js
checkinApi.js
eventApi.js
liveDashboardApi.js
reportApi.js
staffApi.js

components/

Button/
Modal/
ProgressBar/
StatusBadge/
ErrorState/

context/

AuthContext.jsx

features/

event-dashboard/

auth/
prepare-sync/
live-dashboard/
post-event/

staff/

StaffAppShell.jsx
QRScanner.jsx
ScanResult.jsx
ManualCheckIn.jsx

states/
CameraDenied.jsx
ExpiredLink.jsx
RevokedLink.jsx
NetworkError.jsx
NoSearchResults.jsx

lib/

supabaseClient.js
supabaseRealtime.js

styles/

tokens.css

## Backend

app/

Features/
Http/
Models/
Providers/

routes/

api.php
web.php
post_event_sync.php

config/

syncback.php

database/

migrations/
seeders/

## Kiro Specs

.kiro/specs/

c1-attendee-sync/
c2-checkin-sync-back/
c3-post-event-sync/

Future:

a4-staff-onboarding/
a5-empty-error-states/

## Ownership

### Slice A

Frontend Staff PWA

* QR Scan
* Scan Result
* Manual Lookup
* Onboarding
* Empty States
* Error States

### Slice B

Host Dashboard

* Prepare Check-in
* Team Management
* Live Dashboard
* Reports

### Slice C

Sync Layer

* Pre-event Sync
* Sync-back
* Scheduled Sync

### Infrastructure

* Supabase
* Edge Functions
* RLS
* Monitoring
* Magic Links

### ExplaraX Core

* Laravel Integration
* QR Token Generation
* Dashboard Entry Points

## File Placement Rules

Staff-related functionality must remain inside:

features/staff/

Host functionality must remain inside:

features/event-dashboard/

Reusable UI belongs inside:

components/

API code belongs inside:

api/

No business logic should be duplicated across features.
