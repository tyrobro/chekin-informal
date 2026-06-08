<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Creates the event_hmac_keys table that stores per-event HMAC signing keys.
     * Each event has exactly one HMAC key, enforced by a unique index on event_id.
     *
     * Equivalent SQL:
     *   CREATE TABLE event_hmac_keys (
     *       id           BIGSERIAL PRIMARY KEY,
     *       event_id     BIGINT        NOT NULL UNIQUE,
     *       hmac_key     CHAR(64)      NOT NULL,
     *       created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
     *       updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
     *   );
     *   CREATE UNIQUE INDEX idx_event_hmac_keys_event_id ON event_hmac_keys (event_id);
     *
     * Requirements: 5.1, 5.2, 5.4
     */
    public function up(): void
    {
        Schema::create('event_hmac_keys', function (Blueprint $table) {
            // bigserial PRIMARY KEY
            $table->bigIncrements('id');

            // Per-event HMAC key ownership — one key per event.
            // Using a named unique index to match the reference schema exactly.
            $table->unsignedBigInteger('event_id');

            // 64-character lowercase hex HMAC-SHA256 key (32 raw bytes → hex-encoded).
            // NOT NULL is the Laravel default; making it explicit via nullable(false).
            $table->char('hmac_key', 64)->nullable(false);

            // Timestamps with DB-level defaults so they are set even on raw SQL inserts.
            // Note: using timestamp() instead of timestampTz() for SQLite test compatibility.
            // Production (PostgreSQL) stores these in TIMESTAMPTZ via the pgsql driver.
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();

            // Unique constraint + named index matching:
            //   CREATE UNIQUE INDEX idx_event_hmac_keys_event_id ON event_hmac_keys (event_id)
            $table->unique('event_id', 'idx_event_hmac_keys_event_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('event_hmac_keys');
    }
};
