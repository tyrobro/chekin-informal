# Backend Standards

# Backend Standards

## Stack

- Laravel 12
- HTMX
- Python
- Django
- PHP 8.4
- PostgreSQL
- Supabase
- Supabase Edge Functions
- REST APIs
- JWT Authentication
- HMAC-SHA256 Signatures
- Laravel Queues
- Redis (future)
- Docker
- AWS

## Architecture

- Service Layer Pattern
- Repository Pattern
- DTOs for request/response contracts
- Queue Jobs for long-running operations
- Event-driven integrations where appropriate

## Database

- PostgreSQL is source of truth for ExplaraX Core
- Supabase is source of truth during live check-in
- All sync operations must be idempotent

## Code Standards

- Strict typing
- SOLID principles
- Dependency Injection
- Feature-based folder structure
- PHPUnit tests required

~ Use TypeScript strict mode; avoid `any` unless explicitly justified
~ Use async/await for asynchronous operations
~ Always use try-catch blocks for error handling
~ Return consistent response formats:
  { success: boolean, data?: any, error?: string }

~ Follow RESTful API conventions
~ Use appropriate HTTP status codes (200, 201, 202, 400, 401, 403, 404, 409, 422, 429, 500)

~ Validate all request inputs using Zod or equivalent schema validation
~ Never trust client-provided identifiers or permissions
~ Authenticate all protected endpoints
~ Authorize access based on event ownership and staff scope

~ Keep controllers thin; business logic belongs in services
~ Keep database queries inside repositories/data-access layers
~ Use dependency injection where practical

~ Never use SELECT *
~ Explicitly specify returned columns in queries
~ Use database transactions for multi-step writes
~ All schema changes must use migrations

~ All write operations must be idempotent
~ Check-in operations must use atomic database updates
~ Never implement check-in as SELECT -> UPDATE
~ Use UPDATE ... WHERE checked_in_at IS NULL patterns

~ Log all check-in attempts (allowed and denied)
~ Use structured JSON logging
~ Include request_id/correlation_id in logs

~ Never expose stack traces or database errors to clients
~ Never store secrets in source code
~ Read secrets only from environment variables or secret managers

~ Never store unnecessary PII
~ Store only fields defined in the PRD
~ Never store ID document numbers or document images

~ Implement rate limiting on public-facing endpoints
~ Retry transient failures using exponential backoff
~ Maximum 3 retries unless explicitly required

~ Write unit tests for services and utilities
~ Write integration tests for APIs and database operations
~ Write concurrency tests for check-in flows
~ Maintain minimum 80% backend test coverage

~ Target API latency:
  P50 < 80ms
  P99 < 300ms

~ Prioritize correctness over convenience
~ Prioritize security over developer shortcuts
~ Prioritize consistency over clever abstractions
