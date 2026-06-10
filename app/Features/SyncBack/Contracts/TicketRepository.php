<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Contracts;

use App\Features\SyncBack\DTOs\CheckinRecordDTO;

/**
 * Contract for all read/write access to the tickets table
 * within the SyncBack feature.
 *
 * Requirements: 3.1, 3.2, 3.3, 4.1, 7.3
 */
interface TicketRepository
{
    /**
     * Fetch a map of existing ticket rows keyed by ticket_id.
     *
     * Only ticket_id and checked_in_at are selected — no SELECT *.
     *
     * @param  string[]                   $ticketIds
     * @return array<string, \stdClass>   Keyed by ticket_id; each value has ->ticket_id and ->checked_in_at
     */
    public function findByTicketIds(array $ticketIds): array;

    /**
     * Bulk-update check-in fields for the supplied records.
     *
     * Uses a single PostgreSQL UPDATE … FROM (VALUES …) statement per call,
     * guarded by AND checked_in_at IS NULL to prevent overwriting existing data.
     * Wrapped in a DB transaction for chunk-level atomicity.
     *
     * @param CheckinRecordDTO[] $records  Non-empty list of records to update
     */
    public function bulkUpdateCheckinFields(array $records): void;
}
