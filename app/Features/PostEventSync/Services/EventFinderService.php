<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Services;

use App\Features\PostEventSync\Contracts\EventFinderContract;
use Illuminate\Database\ConnectionInterface;

/**
 * Queries the ExplaraX core PostgreSQL database for events that are eligible
 * for post-event sync-back orchestration.
 *
 * An event is eligible when:
 *   - Its end_time has already passed (end_time < NOW())
 *   - Its sync_status is not 'complete' (sync has not finished successfully)
 *   - Its sync_status is not 'in_progress' (no concurrent sync running — Req 1.4)
 *
 * Requirements: 1.2, 1.3, 1.4, 1.6
 */
class EventFinderService implements EventFinderContract
{
    public function __construct(
        private readonly ConnectionInterface $db,
    ) {}

    /**
     * Return event_id strings for events where end_time < NOW()
     * AND sync_status not in ('complete', 'in_progress').
     *
     * The 'in_progress' exclusion satisfies Requirement 1.4: the scheduler
     * must skip events that already have an active orchestration running.
     *
     * @return string[]
     */
    public function findEligible(): array
    {
        $sql = "
            SELECT ess.event_id
            FROM event_sync_status ess
            WHERE ess.sync_status NOT IN ('complete', 'in_progress')
              AND ess.event_id IN (
                  SELECT CAST(id AS VARCHAR) FROM events WHERE end_time < NOW()
              )
        ";

        $rows = $this->db->select($sql);

        if (empty($rows)) {
            return [];
        }

        return array_column(
            array_map('get_object_vars', $rows),
            'event_id'
        );
    }
}
