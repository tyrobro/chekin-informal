<?php
declare(strict_types=1);

namespace App\Features\AttendeeSync\Services;

use Illuminate\Support\Facades\DB;

class AdvisoryLockService
{
    /**
     * Non-blocking attempt to acquire a PostgreSQL session-level advisory lock.
     * Returns false immediately if the lock is already held by another session.
     */
    public function tryAcquire(int $lockKey): bool
    {
        $result = DB::selectOne('SELECT pg_try_advisory_lock(?) AS acquired', [$lockKey]);
        return (bool) ($result->acquired ?? false);
    }

    /**
     * Release a previously acquired advisory lock.
     * Safe to call even if the lock was never acquired (pg_advisory_unlock returns false silently).
     */
    public function release(int $lockKey): void
    {
        DB::statement('SELECT pg_advisory_unlock(?)', [$lockKey]);
    }
}
