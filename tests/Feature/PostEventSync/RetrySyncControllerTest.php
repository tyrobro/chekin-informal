<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Exceptions\SyncAlreadyCompleteException;
use App\Features\PostEventSync\Exceptions\SyncAlreadyInProgressException;
use App\Features\PostEventSync\Services\RetryService;
use Tests\TestCase;

/**
 * HTTP tests for POST /internal/checkin/retry-sync/{event_id} (task 13.4)
 *
 * Requirements: 6.4, 6.5
 *
 * @group c3-post-event-sync
 */
class RetrySyncControllerTest extends TestCase
{
    private const ENDPOINT = '/internal/checkin/retry-sync/EVT-001';
    private const SECRET   = 'test-shared-secret-for-phpunit';

    private function authHeader(string $secret = self::SECRET): array
    {
        return ['Authorization' => "Bearer {$secret}"];
    }

    private function bindRetryService(callable $behavior): void
    {
        $mock = $this->createMock(RetryService::class);
        $mock->method('retry')->willReturnCallback($behavior);
        $this->app->instance(RetryService::class, $mock);
    }

    public function test_missing_secret_returns_401(): void
    {
        $this->postJson(self::ENDPOINT, [], [])
            ->assertStatus(401)
            ->assertJson(['error' => 'Unauthorized']);
    }

    public function test_wrong_secret_returns_401(): void
    {
        $this->postJson(self::ENDPOINT, [], $this->authHeader('wrong-secret'))
            ->assertStatus(401)
            ->assertJson(['error' => 'Unauthorized']);
    }

    public function test_complete_event_returns_409_sync_already_complete(): void
    {
        $this->bindRetryService(function () {
            throw new SyncAlreadyCompleteException('already complete');
        });

        $this->postJson(self::ENDPOINT, [], $this->authHeader())
            ->assertStatus(409)
            ->assertJson(['error' => 'sync_already_complete']);
    }

    public function test_in_progress_event_returns_409_sync_already_in_progress(): void
    {
        $this->bindRetryService(function () {
            throw new SyncAlreadyInProgressException('already in progress');
        });

        $this->postJson(self::ENDPOINT, [], $this->authHeader())
            ->assertStatus(409)
            ->assertJson(['error' => 'sync_already_in_progress']);
    }

    public function test_failed_event_returns_200_with_retry_queued(): void
    {
        $this->bindRetryService(fn () => 3); // starts from batch 3

        $this->postJson(self::ENDPOINT, [], $this->authHeader())
            ->assertStatus(200)
            ->assertJson([
                'event_id'            => 'EVT-001',
                'status'              => 'retry_queued',
                'starting_from_batch' => 3,
            ]);
    }

    public function test_response_contains_correct_event_id(): void
    {
        $this->bindRetryService(fn () => 1);

        $this->postJson('/internal/checkin/retry-sync/MY-EVENT-99', [], $this->authHeader())
            ->assertStatus(200)
            ->assertJsonFragment(['event_id' => 'MY-EVENT-99']);
    }
}
