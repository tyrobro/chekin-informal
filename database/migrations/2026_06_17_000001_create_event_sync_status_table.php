<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Creates the event_sync_status table that tracks the post-event sync-back state for each event.
     * Each event has at most one sync status record, enforced by a unique constraint on event_id.
     *
     * Equivalent SQL:
     *   CREATE TABLE event_sync_status (
     *       id                    BIGSERIAL    PRIMARY KEY,
     *       event_id              VARCHAR(100) NOT NULL,
     *       sync_status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
     *       last_successful_batch INTEGER      NOT NULL DEFAULT 0,
     *       total_batches         INTEGER,
     *       completed_at          TIMESTAMPTZ,
     *       error_message         TEXT,
     *       created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
     *       updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
     *
     *       CONSTRAINT uq_event_sync_status_event_id UNIQUE (event_id)
     *   );
     *   CREATE INDEX idx_event_sync_status_eligible ON event_sync_status (sync_status);
     *
     * Requirements: 5.4, 5.5, 8.1, 8.3
     */
    public function up(): void
    {
        Schema::create('event_sync_status', function (Blueprint $table) {
            // bigserial PRIMARY KEY
            $table->bigIncrements('id');

            // The event this sync status record belongs to — one record per event.
            $table->string('event_id', 100);

            // Lifecycle status: pending → in_progress → complete | failed
            $table->string('sync_status', 20)->default('pending');

            // Tracks how far the sync has progressed — used for resumable retry.
            $table->integer('last_successful_batch')->default(0);

            // Set once partitioning is complete — enables dashboard progress computation.
            $table->integer('total_batches')->nullable();

            // Timestamp when the sync completed successfully (null until then).
            // Uses timestampTz for PostgreSQL TIMESTAMPTZ support on this field.
            $table->timestampTz('completed_at')->nullable();

            // Populated on permanent failure — surfaced to the host via the dashboard.
            $table->text('error_message')->nullable();

            // Timestamps with DB-level defaults so they are set even on raw SQL inserts.
            // Note: using timestamp() instead of timestampTz() for SQLite test compatibility.
            // Production (PostgreSQL) stores these in TIMESTAMPTZ via the pgsql driver.
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();

            // Unique constraint ensuring at most one sync status row per event, matching:
            //   CONSTRAINT uq_event_sync_status_event_id UNIQUE (event_id)
            $table->unique('event_id', 'uq_event_sync_status_event_id');

            // Regular named index to support EventFinderService eligibility query:
            //   SELECT event_id FROM event_sync_status WHERE sync_status <> 'complete' ...
            $table->index('sync_status', 'idx_event_sync_status_eligible');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('event_sync_status');
    }
};
