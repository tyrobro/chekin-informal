<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Repositories;

use App\Features\SyncBack\Contracts\SyncErrorRepository;
use Illuminate\Support\Facades\DB;

/**
 * PostgreSQL implementation of SyncErrorRepository.
 *
 * Rows in checkin_sync_errors are append-only — they are never updated or deleted.
 * A single bulk INSERT is used per chunk to minimise round-trip count.
 *
 * Requirements: 5.2, 7.4
 */
class PostgresSyncErrorRepository implements SyncErrorRepository
{
    /**
     * Bulk-insert a set of sync error rows in a single statement.
     *
     * Uses Laravel's Query Builder insert() which maps to a single
     * multi-row INSERT INTO ... VALUES (...), (...), ... statement.
     *
     * {@inheritDoc}
     */
    public function bulkInsert(array $errors): void
    {
        if ($errors === []) {
            return;
        }

        DB::table('checkin_sync_errors')->insert($errors);
    }
}
