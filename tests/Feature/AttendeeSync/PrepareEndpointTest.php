<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\DTOs\PrepareResponseDTO;
use App\Features\AttendeeSync\Services\AttendeeSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Integration tests for POST /api/internal/checkin/prepare/{event_id}
 *
 * Tasks 15.5, 16.1, 16.2, 16.3
 *
 * @group c1-attendee-sync
 */
class PrepareEndpointTest extends TestCase
{
    use RefreshDatabase;

    /** Task 16.1 — 202 response with sync_id and status=queued */
    public function test_returns_202_with_sync_id_on_success(): void
    {
        Queue::fake();

        $this->mock(AttendeeSyncService::class, function ($mock) {
            $mock->shouldReceive('prepare')
                ->once()
                ->with(204)
                ->andReturn(PrepareResponseDTO::make('550e8400-e29b-41d4-a716-446655440000', 'queued'));
        });

        $response = $this->postJson('/api/internal/checkin/prepare/204');

        $response->assertStatus(202)
            ->assertJsonStructure(['sync_id', 'status', 'queued_at'])
            ->assertJsonFragment(['status' => 'queued']);
    }

    /** Task 16.2 — 409 when advisory lock is already held */
    public function test_returns_409_when_sync_already_in_progress(): void
    {
        $this->mock(AttendeeSyncService::class, function ($mock) {
            $mock->shouldReceive('prepare')
                ->once()
                ->andReturn(null); // null = lock held
        });

        $response = $this->postJson('/api/internal/checkin/prepare/204');

        $response->assertStatus(409)
            ->assertJsonFragment(['status' => 'sync_already_in_progress']);
    }

    /** Task 15.5 / Property 1 — 422 for invalid event_id values */
    public function test_returns_422_for_zero_event_id(): void
    {
        $response = $this->postJson('/api/internal/checkin/prepare/0');
        $response->assertStatus(422)
            ->assertJsonStructure(['errors' => ['event_id']]);
    }

    public function test_returns_422_for_negative_event_id(): void
    {
        $response = $this->postJson('/api/internal/checkin/prepare/-1');
        $response->assertStatus(422)
            ->assertJsonStructure(['errors' => ['event_id']]);
    }

    public function test_returns_422_for_string_event_id(): void
    {
        $response = $this->postJson('/api/internal/checkin/prepare/abc');
        $response->assertStatus(422)
            ->assertJsonStructure(['errors' => ['event_id']]);
    }

    public function test_accepts_positive_integer_event_id(): void
    {
        Queue::fake();

        $this->mock(AttendeeSyncService::class, function ($mock) {
            $mock->shouldReceive('prepare')
                ->andReturn(PrepareResponseDTO::make('550e8400-e29b-41d4-a716-446655440000', 'queued'));
        });

        $this->postJson('/api/internal/checkin/prepare/1')->assertStatus(202);
        $this->postJson('/api/internal/checkin/prepare/999999')->assertStatus(202);
    }

    /** Task 16.3 — 429 after exceeding rate limit */
    public function test_returns_429_after_exceeding_rate_limit(): void
    {
        Queue::fake();

        $this->mock(AttendeeSyncService::class, function ($mock) {
            $mock->shouldReceive('prepare')
                ->andReturn(PrepareResponseDTO::make('550e8400-e29b-41d4-a716-446655440000', 'queued'));
        });

        // Send 10 requests (all should pass with throttle:10,1)
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/internal/checkin/prepare/204');
        }

        // 11th request should be rate-limited
        $response = $this->postJson('/api/internal/checkin/prepare/204');
        $response->assertStatus(429);
    }
}
