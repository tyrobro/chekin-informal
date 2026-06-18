<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Repositories\PostgresCheckedInAttendeeRepository;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Feature: c3-post-event-sync, Property 3: CheckedIn Attendee Filter
 *
 * For any event with K checked-in rows returned by Supabase,
 * fetchCheckedIn() returns exactly K records with all 5 required fields,
 * none have a null/empty checked_in_at.
 *
 * Validates: Requirements 2.1, 2.2, 2.4
 *
 * Uses manual iteration instead of Eris to avoid Http::fake reset conflicts.
 *
 * @group c3-post-event-sync
 */
class PostgresCheckedInAttendeeRepositoryPropertyTest extends TestCase
{
    /**
     * Feature: c3-post-event-sync, Property 3: CheckedIn Attendee Filter
     */
    public function test_checked_in_attendee_filter(): void
    {
        $repo = new PostgresCheckedInAttendeeRepository();

        // Single Http::fake with a mutable reference — avoids stubCallback accumulation
        // that occurs when Http::fake() is called repeatedly inside a loop.
        $currentRows = [];
        Http::fake([
            '*' => function () use (&$currentRows) {
                return Http::response($currentRows, 200);
            },
        ]);

        for ($iteration = 0; $iteration < 100; $iteration++) {
            $k = random_int(0, 50);

            // Update the reference for this iteration
            $currentRows = [];
            for ($i = 1; $i <= $k; $i++) {
                $currentRows[] = [
                    'ticket_id'       => "T-{$i}",
                    'checked_in_at'   => '2026-06-15T09:14:23Z',
                    'checked_in_gate' => 'Gate A',
                    'checked_in_by'   => 'staff-001',
                    'checkin_method'  => 'qr_scan',
                ];
            }

            $result = $repo->fetchCheckedIn('EVT-PROP-' . $iteration);

            // Must return exactly K records
            $this->assertCount($k, $result, "Iteration {$iteration}: expected {$k} records, got " . count($result));

            // Each record must have all 5 required fields as non-empty strings
            foreach ($result as $dto) {
                $this->assertIsString($dto->ticket_id,       "Iteration {$iteration}: ticket_id must be a string");
                $this->assertIsString($dto->checked_in_at,   "Iteration {$iteration}: checked_in_at must be a string");
                $this->assertIsString($dto->checked_in_gate, "Iteration {$iteration}: checked_in_gate must be a string");
                $this->assertIsString($dto->checked_in_by,   "Iteration {$iteration}: checked_in_by must be a string");
                $this->assertIsString($dto->checkin_method,  "Iteration {$iteration}: checkin_method must be a string");

                // checked_in_at must not be empty (the filter guarantee)
                $this->assertNotEmpty($dto->checked_in_at,
                    "Iteration {$iteration}: checked_in_at must not be empty");
            }
        }
    }
}
