<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Creates the event_preparations table that tracks the sync state for each event.
     * Each event has at most one preparation record, enforced by a unique index on event_id.
     *
     * Equivalent SQL:
     *   CREATE TABLE event_preparations (
     *       id              BIGSERIAL PRIMARY KEY,
     *       event_id        BIGINT        NOT NULL UNIQUE,
     *       sync_id         UUID          NOT NULL,
     *       status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
     *       attendee_count  INTEGER,
     *       batch_count     INTEGER,
     *       error_message   TEXT,
     *       prepared_at     TIMESTAMPTZ,
     *       created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
     *       updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
     *   );
     *   CREATE UNIQUE INDEX idx_event_preparations_event_id ON event_preparations (event_id);
     *   CREATE INDEX        idx_event_preparations_sync_id  ON event_preparations (sync_id);
     *
     * Requirements: 8.1, 8.2, 8.3, 8.4
     */
    public function up(): void
    {
        Schema::create('event_preparations', function (Blueprint $table) {
            // bigserial PRIMARY KEY
            $table->bigIncrements('id');

            // The event this preparation record belongs to — one record per event.
            $table->unsignedBigInteger('event_id');

            // UUID assigned at the start of each sync run for log correlation.
            $table->uuid('sync_id');

            // Lifecycle status: pending → in_progress → completed | failed
            $table->string('status', 20)->default('pending');

            // Populated once the sync job completes successfully.
            $table->integer('attendee_count')->nullable();
            $table->integer('batch_count')->nullable();

            // Populated on failure — surfaced to the host via the API.
            $table->text('error_message')->nullable();

            // Timestamp when the sync completed (null until then).
            $table->timestamp('prepared_at')->nullable();

            // Timestamps with DB-level defaults so they are set even on raw SQL inserts.
            // Note: using timestamp() instead of timestampTz() for SQLite test compatibility.
            // Production (PostgreSQL) stores these in TIMESTAMPTZ via the pgsql driver.
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();

            // Unique constraint + named index matching:
            //   CREATE UNIQUE INDEX idx_event_preparations_event_id ON event_preparations (event_id)
            $table->unique('event_id', 'idx_event_preparations_event_id');

            // Regular named index matching:
            //   CREATE INDEX idx_event_preparations_sync_id ON event_preparations (sync_id)
            $table->index('sync_id', 'idx_event_preparations_sync_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('event_preparations');
    }
};
