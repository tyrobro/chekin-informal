# ExplaraX Check-in Technical Standards

## Frontend Stack

* React
* React Router
* Vite
* CSS Modules
* Supabase Client SDK

## Backend Stack

* Laravel
* PHP
* PostgreSQL
* Supabase

## Architectural Rules

### Feature-First Structure

Organize code by feature rather than by page type.

Good:

features/
staff/
event-dashboard/
prepare-sync/

Avoid:

pages/
screens/
misc/

### Component Rules

Components must:

* Be single-purpose
* Be reusable
* Avoid business logic when possible

### State Management

Use:

* React Context for auth/session
* Local component state where appropriate

Avoid:

* Global state for temporary UI behavior

### API Layer

All network calls must pass through:

src/api/

No direct fetch calls inside components.

### Error Handling

All API failures must:

* Show a user-friendly message
* Avoid exposing internal errors
* Log diagnostic information

### Accessibility

All interactive controls require:

* Labels
* Keyboard navigation
* Visible focus state

### Security

Never store:

* HMAC keys
* Service role keys
* Secrets

in source code, localStorage, sessionStorage, or Git.

### Empty State Standard

Every empty state must contain:

* Explanation
* Recovery action
* Consistent styling

### Error State Standard

Every error state must contain:

* Error title
* Explanation
* Recovery action

### Testing Expectations

New functionality must include:

* Happy path
* Failure path
* Edge case verification

No feature is complete without testing.
