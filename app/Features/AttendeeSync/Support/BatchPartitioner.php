<?php
declare(strict_types=1);

namespace App\Features\AttendeeSync\Support;

class BatchPartitioner
{
    /**
     * Split an attendee array into batches of $batchSize.
     * The final batch may contain fewer than $batchSize items.
     *
     * For N attendees: produces ceil(N / batchSize) batches.
     * Every non-final batch has exactly $batchSize items.
     * The final batch has N mod $batchSize items (or $batchSize if N divisible).
     *
     * @param array $attendees  Flat array of any items (AttendeeUpsertDTO[])
     * @param int   $batchSize  Must be >= 1
     * @return array[]          Array of arrays (batches)
     */
    public static function partition(array $attendees, int $batchSize): array
    {
        if ($batchSize < 1) {
            throw new \InvalidArgumentException('Batch size must be >= 1');
        }

        return array_chunk($attendees, $batchSize);
    }
}
