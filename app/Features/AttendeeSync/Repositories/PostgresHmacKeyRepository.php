<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Repositories;

use App\Features\AttendeeSync\Contracts\HmacKeyRepository;
use Illuminate\Support\Facades\DB;

class PostgresHmacKeyRepository implements HmacKeyRepository
{
    public function getOrCreate(int $eventId): string
    {
        return DB::transaction(function () use ($eventId): string {
            // Generate a candidate key (will be discarded if row already exists)
            $candidateKey = bin2hex(random_bytes(32)); // 64-char lowercase hex

            // Atomic upsert: insert if not exists, do nothing on conflict
            DB::statement(
                'INSERT INTO event_hmac_keys (event_id, hmac_key, created_at, updated_at)
                 VALUES (?, ?, NOW(), NOW())
                 ON CONFLICT (event_id) DO NOTHING',
                [$eventId, $candidateKey]
            );

            // Always SELECT to get the authoritative key (whether just inserted or pre-existing)
            $row = DB::selectOne(
                'SELECT hmac_key FROM event_hmac_keys WHERE event_id = ?',
                [$eventId]
            );

            if ($row === null) {
                throw new \RuntimeException("Failed to get or create HMAC key for event {$eventId}");
            }

            return $row->hmac_key;
        });
    }
}
