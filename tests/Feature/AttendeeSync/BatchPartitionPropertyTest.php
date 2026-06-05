<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\Support\BatchPartitioner;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Property 6: Batch partitioning is correct for any attendee count.
 *
 * @group c1-attendee-sync
 */
class BatchPartitionPropertyTest extends TestCase
{
    use TestTrait;

    private const BATCH_SIZE = 10; // smaller size for faster iteration

    public function test_batch_count_is_ceil_of_n_over_batch_size(): void
    {
        $this
            ->forAll(
                Generator::choose(1, 5000) // N in [1, 5000]
            )
            ->withMaxSize(500)
            ->then(function (int $n) {
                $items     = range(1, $n);
                $batchSize = self::BATCH_SIZE;
                $batches   = BatchPartitioner::partition($items, $batchSize);

                $expectedBatchCount = (int) ceil($n / $batchSize);

                $this->assertCount(
                    $expectedBatchCount,
                    $batches,
                    "N={$n}: expected {$expectedBatchCount} batches"
                );

                // All non-final batches must have exactly $batchSize items
                $allExceptLast = array_slice($batches, 0, -1);
                foreach ($allExceptLast as $i => $batch) {
                    $this->assertCount(
                        $batchSize,
                        $batch,
                        "N={$n}: batch {$i} should have exactly {$batchSize} items"
                    );
                }

                // Final batch
                $lastBatch         = end($batches);
                $remainder         = $n % $batchSize;
                $expectedLastCount = $remainder === 0 ? $batchSize : $remainder;

                $this->assertCount(
                    $expectedLastCount,
                    $lastBatch,
                    "N={$n}: final batch should have {$expectedLastCount} items"
                );

                // No items lost
                $total = array_sum(array_map('count', $batches));
                $this->assertSame($n, $total, "N={$n}: total items across all batches must equal N");
            });
    }
}
