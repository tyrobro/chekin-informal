<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\DTOs;

use App\Features\PostEventSync\DTOs\CheckedInAttendeeDTO;

/**
 * Represents a single batch of checked-in attendees to be dispatched to the
 * C2 sync-back endpoint.
 *
 * The `batch_id` is deterministically derived from the event and batch index:
 *
 *   batch_id = hash('sha256', event_id.':'.batch_number)
 *
 * This guarantees that retrying the same batch always produces an identical
 * `batch_id`, allowing C2 to deduplicate repeated POSTs without any extra
 * state on the C3 side.
 *
 * Requirements: 4.2, 9.2
 */
readonly class SyncBatchDTO
{
    /**
     * @param string                 $event_id     The event this batch belongs to.
     * @param int                    $batch_number 1-based sequential index of this batch.
     * @param string                 $batch_id     Deterministic identifier:
     *                                             hash('sha256', event_id.':'.batch_number)
     * @param CheckedInAttendeeDTO[] $records      Attendee records in this batch.
     */
    public function __construct(
        public string $event_id,
        public int    $batch_number,
        public string $batch_id,
        public array  $records,
    ) {}
}
