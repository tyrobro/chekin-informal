<?php

declare(strict_types=1);

namespace Tests\Feature\PostEventSync;

use App\Features\AttendeeSync\Support\BatchPartitioner;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Feature: c3-post-event-sync, Property 1: BatchPartitioner Round-Trip
 *
 * Validates: Requirements 3.2, 3.3, 3.4
 *
 * For any N checked-in records, partitioning with batch size 1,000 and
 * flattening all batches produces the original N records in original order.
 * Every non-final batch has exactly 1,000 records. Final batch has 1–1,000.
 * Batch count = ceil(N / 1000).
 *
 * @group c3-post-event-sync
 */
class BatchPartitionerPropertyTest extends TestCase
{
    use TestTrait;

    public function test_batch_partitioner_round_trip(): void
    {
        // Edge case: N=0 returns empty array immediately
        $result = BatchPartitioner::partition([], 1000);
        $this->assertSame([], $result);

        // Property: for any N in [1, 5000]
        $this
            ->forAll(
                Generator::choose(1, 5000)
            )
            ->withMaxSize(500)
            ->then(function (int $n): void {
                $records = range(1, $n);
                $batches = BatchPartitioner::partition($records, 1000);

                // Batch count = ceil(N / 1000)
                $expectedBatchCount = (int) ceil($n / 1000);
                $this->assertCount(
                    $expectedBatchCount,
                    $batches,
                    "N={$n}: expected {$expectedBatchCount} batches, got " . count($batches)
                );

                // Every non-final batch has exactly 1,000 records
                $allExceptLast = array_slice($batches, 0, -1);
                foreach ($allExceptLast as $i => $batch) {
                    $this->assertCount(
                        1000,
                        $batch,
                        "N={$n}: non-final batch {$i} must have exactly 1000 records"
                    );
                }

                // Final batch has between 1 and 1,000 records inclusive
                $lastBatch = end($batches);
                $this->assertGreaterThanOrEqual(1, count($lastBatch));
                $this->assertLessThanOrEqual(1000, count($lastBatch));

                // Round-trip: flatten all batches = original records in original order
                $flattened = array_merge(...$batches);
                $this->assertSame($records, $flattened, "N={$n}: flatten(partition(records)) must equal records");
            });
    }
}
