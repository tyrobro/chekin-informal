<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Repositories;

use App\Features\SyncBack\Contracts\TicketRepository;
use App\Features\SyncBack\DTOs\CheckinRecordDTO;
use Illuminate\Support\Facades\DB;

/**
 * PostgreSQL implementation of TicketRepository.
 *
 * All queries explicitly name columns — no SELECT * is used.
 *
 * Requirements: 3.2, 3.3, 3.5, 4.1, 7.3
 */
class PostgresTicketRepository implements TicketRepository
{
    /**
     * Fetch existing ticket rows keyed by ticket_id.
     *
     * Only ticket_id and checked_in_at are selected so the service layer can
     * perform the idempotency check (Idempotency Key = ticket_id + checked_in_at).
     *
     * {@inheritDoc}
     */
    public function findByTicketIds(array $ticketIds): array
    {
        if ($ticketIds === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ticketIds), '?'));

        $rows = DB::select(
            "SELECT ticket_id, checked_in_at FROM tickets WHERE ticket_id IN ({$placeholders})",
            $ticketIds
        );

        // Index by ticket_id for O(1) lookup in the service layer.
        $map = [];
        foreach ($rows as $row) {
            $map[$row->ticket_id] = $row;
        }

        return $map;
    }

    /**
     * Bulk-update check-in fields using a single PostgreSQL VALUES list statement.
     *
     * The WHERE guard `AND t.checked_in_at IS NULL` is the DB-level idempotency
     * safety net: even if a duplicate slips past the service-layer check, it will
     * not overwrite an already-applied check-in.
     *
     * Uses DB::transaction() for chunk-level atomicity (Requirement 3.5).
     *
     * {@inheritDoc}
     */
    public function bulkUpdateCheckinFields(array $records): void
    {
        if ($records === []) {
            return;
        }

        // Build the VALUES list: (?, ?, ?, ?, ?) per record
        $valuePlaceholders = implode(
            ', ',
            array_fill(0, count($records), '(?, ?, ?, ?, ?)')
        );

        // Flatten bindings: [ticket_id, checked_in_at, gate, by, method, ...]
        $bindings = [];
        foreach ($records as $record) {
            $bindings[] = $record->ticket_id;
            $bindings[] = $record->checked_in_at;
            $bindings[] = $record->checked_in_gate;
            $bindings[] = $record->checked_in_by;
            $bindings[] = $record->checkin_method;
        }

        $sql = "UPDATE tickets AS t
                SET
                    checked_in_at   = v.checked_in_at::timestamptz,
                    checked_in_gate = v.checked_in_gate,
                    checked_in_by   = v.checked_in_by,
                    checkin_method  = v.checkin_method,
                    updated_at      = NOW()
                FROM (VALUES {$valuePlaceholders}) AS v(ticket_id, checked_in_at, checked_in_gate, checked_in_by, checkin_method)
                WHERE t.ticket_id = v.ticket_id
                  AND t.checked_in_at IS NULL";

        DB::transaction(static function () use ($sql, $bindings): void {
            DB::statement($sql, $bindings);
        });
    }
}
