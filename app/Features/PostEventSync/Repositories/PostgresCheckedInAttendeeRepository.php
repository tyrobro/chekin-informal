<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Repositories;

use App\Features\PostEventSync\Contracts\CheckedInAttendeeRepository;
use App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO;
use App\Features\PostEventSync\Exceptions\PostEventSyncException;
use Illuminate\Support\Facades\Http;

/**
 * Fetches checked-in attendee records for a given event from Supabase REST API.
 *
 * Issues a GET request to the Supabase `event_attendees` table, filtering to
 * only rows where `checked_in_at IS NOT NULL`. Uses exponential backoff (up to
 * 3 attempts) matching the pattern from HttpExplaraXAttendeeRepository.
 *
 * C3 never writes to Supabase — all interaction here is read-only.
 *
 * Requirements: 2.1, 2.2, 2.4
 */
class PostgresCheckedInAttendeeRepository implements CheckedInAttendeeRepository
{
    private const MAX_RETRIES = 3;

    /**
     * Backoff delays in seconds, indexed by attempt number (0-based).
     * Attempt 0: no delay, attempt 1: 2 s, attempt 2: 4 s, attempt 3: 8 s.
     *
     * @var int[]
     */
    private const RETRY_DELAYS = [0, 2, 4, 8];

    /**
     * Fetch all tickets for $eventId where checked_in_at IS NOT NULL from Supabase.
     * Returns an empty array if no check-ins exist for the event.
     *
     * GET {SUPABASE_URL}/rest/v1/event_attendees
     *     ?event_id=eq.{eventId}
     *     &checked_in_at=not.is.null
     *     &select=ticket_id,checked_in_at,checked_in_gate,checked_in_by,checkin_method
     *
     * @return CheckedInAttendeeDTO[]
     * @throws PostEventSyncException when all retries are exhausted
     */
    public function fetchCheckedIn(string $eventId): array
    {
        $supabaseUrl = rtrim((string) env('SUPABASE_URL', ''), '/');
        $serviceKey  = (string) env('SUPABASE_SERVICE_ROLE_KEY', '');
        $endpoint    = "{$supabaseUrl}/rest/v1/event_attendees";

        $baseDelay = (int) env('SUPABASE_RETRY_DELAY', 1);
        $lastError = null;

        for ($attempt = 0; $attempt < self::MAX_RETRIES; $attempt++) {
            if ($attempt > 0 && $baseDelay > 0) {
                sleep(self::RETRY_DELAYS[$attempt] * $baseDelay);
            }

            try {
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$serviceKey}",
                    'apikey'        => $serviceKey,
                ])
                ->withQueryParameters([
                    'event_id'       => "eq.{$eventId}",
                    'checked_in_at'  => 'not.is.null',
                    'select'         => 'ticket_id,checked_in_at,checked_in_gate,checked_in_by,checkin_method',
                ])
                ->get($endpoint);

                if ($response->successful()) {
                    $rows = $response->json();

                    if (! is_array($rows)) {
                        return [];
                    }

                    return array_map(
                        static fn (array $row): CheckedInAttendeeDTO => CheckedInAttendeeDTO::fromSupabaseRow($row),
                        $rows
                    );
                }

                $lastError = new PostEventSyncException(
                    "Supabase fetchCheckedIn failed with HTTP {$response->status()} for event {$eventId}: {$response->body()}"
                );
            } catch (\Exception $e) {
                $lastError = new PostEventSyncException(
                    "Supabase fetchCheckedIn request threw exception for event {$eventId}: {$e->getMessage()}",
                    0,
                    $e
                );
            }
        }

        throw $lastError ?? new PostEventSyncException(
            "Supabase fetchCheckedIn failed after " . self::MAX_RETRIES . " retries for event {$eventId}"
        );
    }
}
