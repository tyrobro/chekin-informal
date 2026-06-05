<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Repositories;

use App\Features\AttendeeSync\Contracts\ExplaraXAttendeeRepository;
use App\Features\AttendeeSync\DTOs\AttendeeDTO;
use App\Features\AttendeeSync\Exceptions\ExplaraXApiException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class HttpExplaraXAttendeeRepository implements ExplaraXAttendeeRepository
{
    private const MAX_RETRIES = 3;

    /**
     * Delay in seconds before each retry attempt (index = attempt number, 0-based).
     * Attempt 0: no delay (first try), attempt 1: 2s, attempt 2: 4s, attempt 3: 8s.
     *
     * @var int[]
     */
    private const RETRY_DELAYS = [0, 2, 4, 8];

    /**
     * Fetch all attendees for the given event from the ExplaraX Payments API.
     * Handles pagination automatically. PII is stripped by AttendeeDTO::fromApiResponse.
     *
     * @return AttendeeDTO[]
     * @throws ExplaraXApiException
     */
    public function fetchAllForEvent(int $eventId): array
    {
        $baseUrl = rtrim(
            (string) config('services.explara.payments_url', env('EXPLARA_PAYMENTS_URL', 'https://payments.explarax.com')),
            '/'
        );
        $token = (string) config('services.explara.api_token', env('EXPLARA_API_TOKEN', ''));

        $url     = "{$baseUrl}/api/event/{$eventId}/attendees";
        $allDtos = [];

        while ($url !== null) {
            $response = $this->fetchWithRetry($url, $token);
            $body     = $response->json();

            // Support both paginated responses (with a 'data' key) and flat array responses
            $records = is_array($body['data'] ?? null) ? $body['data'] : $body;

            foreach ($records as $record) {
                if (is_array($record)) {
                    $allDtos[] = AttendeeDTO::fromApiResponse($eventId, $record);
                }
            }

            // Advance to the next page if available (Laravel-style pagination or JSON:API links)
            $nextPageUrl = $body['next_page_url'] ?? ($body['links']['next'] ?? null);
            $url = is_string($nextPageUrl) && $nextPageUrl !== '' ? $nextPageUrl : null;
        }

        return $allDtos;
    }

    /**
     * Perform a GET request with up to MAX_RETRIES attempts and exponential backoff.
     * Delays: 0s (first attempt), 2s, 4s, 8s on subsequent retries.
     *
     * @throws ExplaraXApiException when all retries are exhausted
     */
    private function fetchWithRetry(string $url, string $token): Response
    {
        $lastException = null;

        for ($attempt = 0; $attempt < self::MAX_RETRIES; $attempt++) {
            if ($attempt > 0) {
                $baseDelay = (int) env('EXPLARA_RETRY_DELAY', 1);
                if ($baseDelay > 0) {
                    sleep(self::RETRY_DELAYS[$attempt] * $baseDelay);
                }
            }

            try {
                $response = Http::withToken($token)->get($url);

                if ($response->successful()) {
                    return $response;
                }

                $lastException = new ExplaraXApiException(
                    "ExplaraX API returned HTTP {$response->status()} for URL: {$url}"
                );
            } catch (\Exception $e) {
                $lastException = new ExplaraXApiException(
                    "ExplaraX API request failed for URL {$url}: {$e->getMessage()}",
                    0,
                    $e
                );
            }
        }

        throw $lastException ?? new ExplaraXApiException(
            "ExplaraX API unreachable after " . self::MAX_RETRIES . " retries for URL: {$url}"
        );
    }
}
