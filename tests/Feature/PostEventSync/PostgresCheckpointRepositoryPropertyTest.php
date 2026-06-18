<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\PostEventSync\Repositories\PostgresCheckpointRepository;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Feature: c3-post-event-sync
 *
 * Property 5: Checkpoint Monotonicity
 *   For any batch sequence [1..K], last_successful_batch never decreases.
 *   Validates: Requirement 5.1
 *
 * Property 12: total_batches Accuracy
 *   For any N records, markInProgress sets total_batches = ceil(N/1000).
 *   Validates: Requirement 8.3
 *
 * @group c3-post-event-sync
 */
class PostgresCheckpointRepositoryPropertyTest extends TestCase
{
    use RefreshDatabase;
    use TestTrait;

    private PostgresCheckpointRepository $repo;
    private int $eventCounter = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repo = new PostgresCheckpointRepository(DB::connection());
    }

    private function freshEventId(): string
    {
        return 'PROP-EVT-' . (++$this->eventCounter) . '-' . uniqid('', true);
    }

    /**
     * Property 5: Checkpoint Monotonicity
     * Feature: c3-post-event-sync, Property 5: Checkpoint Monotonicity
     */
    public function test_checkpoint_monotonicity(): void
    {
        $this
            ->forAll(
                Generator::choose(1, 20) // K batches
            )
            ->withMaxSize(50)
            ->then(function (int $k): void {
                $eventId = $this->freshEventId();
                $this->repo->upsertPending($eventId);
                $this->repo->markInProgress($eventId, $k);

                $prev = 0;
                for ($batchNumber = 1; $batchNumber <= $k; $batchNumber++) {
                    $this->repo->recordBatchSuccess($eventId, $batchNumber);

                    $dto = $this->repo->find($eventId);
                    $this->assertNotNull($dto);
                    $current = $dto->last_successful_batch;

                    $this->assertGreaterThanOrEqual(
                        $prev,
                        $current,
                        "last_successful_batch must never decrease: was {$prev}, now {$current} at batch {$batchNumber}"
                    );
                    $prev = $current;
                }

                $this->assertSame($k, $prev, "After all batches, last_successful_batch should equal K={$k}");
            });
    }

    /**
     * Property 12: total_batches Accuracy
     * Feature: c3-post-event-sync, Property 12: total_batches Accuracy
     */
    public function test_total_batches_accuracy(): void
    {
        $this
            ->forAll(
                Generator::choose(1, 10000) // N records
            )
            ->withMaxSize(50)
            ->then(function (int $n): void {
                $eventId      = $this->freshEventId();
                $expectedBatches = (int) ceil($n / 1000);

                $this->repo->upsertPending($eventId);
                $this->repo->markInProgress($eventId, $expectedBatches);

                $dto = $this->repo->find($eventId);
                $this->assertNotNull($dto);
                $this->assertSame(
                    $expectedBatches,
                    $dto->total_batches,
                    "N={$n}: expected total_batches={$expectedBatches}, got {$dto->total_batches}"
                );
            });
    }
}
