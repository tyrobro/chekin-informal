<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Services;

use App\Features\AttendeeSync\Exceptions\SupabaseBatchException;
use Illuminate\Support\Facades\Http;

class SupabaseUpsertService
{
    /**
     * POST a batch of attendee rows to the Supabase REST API.
     * Uses ON CONFLICT (ticket_id) merge strategy — does NOT overwrite CheckIn fields.
     *
     * @param int   $batchNumber For logging/error context only
     * @param array $rows        Array of AttendeeUpsertDTO::toUpsertArray() results
     * @throws SupabaseBatchException after 3 failed retries
     */
    public function upsertBatch(int $batchNumber, array $rows): void
    {
        $supabaseUrl = rtrim((string) env('SUPABASE_URL', ''), '/');
        $serviceKey  = (string) env('SUPABASE_SERVICE_ROLE_KEY', '');
        $endpoint    = "{$supabaseUrl}/rest/v1/attendees";

        $delays    = [2, 4, 8]; // exponential backoff seconds — set SUPABASE_RETRY_DELAY=0 to disable in tests
        $baseDelay = (int) env('SUPABASE_RETRY_DELAY', 1); // multiplier; 0 = instant retry
        $lastError = null;

        foreach ($delays as $attempt => $delaySecs) {
            if ($attempt > 0 && $baseDelay > 0) {
                sleep($delaySecs * $baseDelay);
            }

            try {
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$serviceKey}",
                    'apikey'        => $serviceKey,
                    'Content-Type'  => 'application/json',
                    'Prefer'        => 'resolution=merge-duplicates',
                ])
                ->withQueryParameters(['on_conflict' => 'ticket_id'])
                ->post($endpoint, $rows);

                if ($response->successful()) {
                    return; // success — exit
                }

                $lastError = new SupabaseBatchException(
                    "Supabase batch {$batchNumber} failed with HTTP {$response->status()}: {$response->body()}"
                );
            } catch (\Exception $e) {
                $lastError = new SupabaseBatchException(
                    "Supabase batch {$batchNumber} request threw exception: {$e->getMessage()}",
                    0,
                    $e
                );
            }
        }

        throw $lastError ?? new SupabaseBatchException("Supabase batch {$batchNumber} failed after retries");
    }
}
