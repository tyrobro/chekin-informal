# Frontend Standards

# Tech Stack

## Core

* React 19
* TypeScript
* Next.js 15 (App Router)
* Tailwind CSS
* shadcn/ui
* React Hook Form
* Zod
* TanStack Query
* Supabase Client SDK
* HTMX
* Python
* Django
* Postgres

## PWA

* Progressive Web App support
* Service Worker
* Web Manifest
* Add To Home Screen support
* IndexedDB (future offline support)

## QR Scanning

Preferred order:

1. BarcodeDetector API
2. html5-qrcode fallback

Frontend should automatically detect capability.

## State Management

Use:

* TanStack Query for server state
* React Context for session state
* Local component state where appropriate

Avoid global state unless necessary.

---

# Architecture Rules

## Feature-Based Structure

Example:

src/
features/
auth/
checkin/
manual-lookup/
dashboard/
reports/
staff/
shared/

Do not organize by component type.

Avoid:

components/
pages/
hooks/
utils/

as primary architecture.

---

# Component Rules

Components should be:

* Small
* Reusable
* Single responsibility
* Fully typed

Preferred structure:

Feature Page
→ Feature Container
→ Feature Components
→ Shared UI Components

Avoid business logic inside UI components.

---

# Data Fetching

Use TanStack Query.

Requirements:

* Query keys centralized
* Loading states implemented
* Error states implemented
* Retry behavior configured
* Optimistic updates only when safe

Never fetch directly inside render logic.

---

# Forms

Use:

* React Hook Form
* Zod validation

Requirements:

* Client validation
* Server validation handling
* Accessible error messages
* Loading states during submission

---

# TypeScript Standards

Never use:

* any
* ts-ignore

Prefer:

* interfaces
* discriminated unions
* strict typing

All API responses must have typed contracts.

---

# Realtime Standards

Realtime events are informational.

Frontend must never assume realtime data is authoritative.

Always trust server responses.

Use realtime only for:

* Dashboard updates
* Gate activity updates
* Recent scan feeds

---

# QR Scan UX Standards

Requirements:

* Camera startup under 1 second
* Scan feedback under 500ms end-to-end
* Debounce duplicate scans
* Haptic feedback on success/failure
* Visible scan reticle
* Graceful camera permission handling

---

# Accessibility

Requirements:

* Keyboard navigation
* Screen-reader labels
* WCAG AA contrast
* Focus states visible
* Error messages announced correctly

---

# Error Handling

Every screen must support:

* Loading state
* Empty state
* Error state
* Success state

No blank screens.

No silent failures.

---

# Design System

Primary Color:
#7E57C2

Success:
#5BC97C

Error:
#D64545

Text:
#1F1E1E
#3B3535

Do not create new visual patterns unless required.

---

# Testing Standards

Required:

* Unit Tests
* Component Tests
* Integration Tests

Critical flows:

* QR scanning
* Manual lookup
* Staff onboarding
* Host dashboard
* Realtime updates

All acceptance criteria must have corresponding tests.

---

# Performance Standards

PWA startup:
< 2s

QR decode:
< 50ms

Search:
< 500ms for 10,000 attendees

Dashboard updates:
< 2s from broadcast

Avoid unnecessary re-renders.

Use memoization only when profiling proves benefit.

---

# Security Rules

Never store:

* HMAC keys in localStorage
* Secrets in frontend code
* Service role keys
* Internal API credentials

Sensitive data must remain server-side.

Frontend validates UX.
Backend enforces security.

Never rely on frontend authorization checks.


## Architecture

* Follow feature-based architecture (`features/scanner`, `features/dashboard`, etc.)
* Keep business logic inside hooks and services, not UI components
* Components should have a single responsibility
* Prefer composition over deeply nested component hierarchies
* Shared UI components belong in `components/`
* Feature-specific components stay inside their feature folder

## State Management

* Use `useState` for local UI state
* Use Context API only for shared application state
* Use TanStack Query for server state
* Use Supabase Realtime subscriptions for live updates
* Avoid prop drilling; expose shared state through custom hooks
* Keep state as close as possible to where it is used

## Data Fetching

* Use TanStack Query for all API requests
* Encapsulate API logic inside service files
* Never call Supabase directly from UI components
* Define query keys centrally
* Always handle loading, error, and empty states
* Clean up subscriptions and realtime connections correctly

## Component Patterns

* Prefer functional components
* Keep components pure and predictable
* Extract reusable logic into custom hooks
* Split components larger than ~150 lines
* Prefer explicit props over implicit behavior
* Avoid deeply nested conditional rendering

## Forms

* Use React Hook Form
* Use Zod for validation
* Validate on both client and server
* Display validation messages inline
* Disable submit actions while requests are pending
* Use consistent error presentation patterns

## TypeScript

* Enable strict mode
* Never use `any`
* Prefer explicit interfaces and types
* Define API request/response contracts
* Type all component props
* Export shared types from `types/`

## Routing

* Use React Router
* Route components should remain thin
* Move business logic into hooks/services
* Protect authenticated routes
* Handle invalid routes with dedicated error pages

## Error Handling

* Catch all async errors
* Never expose raw backend errors to users
* Show actionable error messages
* Log unexpected failures
* Provide retry actions where appropriate

## Performance

* Design mobile-first
* Virtualize large lists (>100 items)
* Lazy-load non-critical routes
* Optimize renders before introducing memoization
* Use React Profiler when investigating performance issues
* Minimize unnecessary re-renders

## Accessibility

* Use semantic HTML
* Provide labels for all form controls
* Ensure keyboard navigation works
* Maintain visible focus states
* Add appropriate ARIA attributes
* Meet WCAG AA contrast requirements

## PWA Standards

* Support install prompts
* Implement service worker registration
* Handle offline shell gracefully
* Cache only safe public assets
* Never persist sensitive event data locally
* Support Add-to-Home-Screen flow

## Security

* Never store HMAC keys in localStorage
* Never store service-role keys on the client
* Keep sensitive session data in memory when possible
* Sanitize all user input
* Assume client validation can be bypassed
* Follow Supabase RLS constraints

## Styling

* Use TailwindCSS utilities
* Use shadcn/ui as the default component library
* Use design tokens instead of hardcoded values
* Follow ExplaraX brand colors
* Maintain consistent spacing scale
* Prefer reusable UI primitives

## Testing

* Use Vitest and React Testing Library
* Test user-facing behavior, not implementation details
* Cover loading, success, and error states
* Test critical flows end-to-end
* Maintain minimum 80% coverage for business-critical features

## Code Quality

* Remove all debug logs before production
* Use centralized logging utilities
* Follow consistent naming conventions
* Keep functions focused and small
* Document non-obvious business logic
* Do not introduce new dependencies without justification

## Naming Conventions

* Components → PascalCase
* Hooks → useSomething
* Types → PascalCase
* Constants → UPPER_SNAKE_CASE
* Files → kebab-case
* Feature folders → kebab-case

