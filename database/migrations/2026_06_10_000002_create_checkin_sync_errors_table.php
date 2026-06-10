<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Creates the checkin_sync_errors table — an append-only audit log for
     * check-in records that could not be applied to the tickets table (e.g.
     * because the ticket_id does not exist in ExplaraX core).
     *
     * Equivalent SQL:
     *   CREATE TABLE checkin_sync_errors (
     *       id         BIGSERIAL     PRIMARY KEY,
     *       event_id   VARCHAR(100)  NOT NULL,
     *       ticket_id  VARCHAR(100)  NOT NULL,
     *       reason     TEXT          NOT NULL,
     *       payload    JSONB         NOT NULL,
     *       created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
     *   );
     *   CREATE INDEX idx_sync_errors_event_id  ON checkin_sync_errors (event_id);
     *   CREATE INDEX idx_sync_errors_ticket_id ON checkin_sync_errors (ticket_id);
     *
     * No updated_at — rows are append-only and never modified after insert.
     *
     * Requirements: 5.1, 5.2
     */
    public function up(): void
    {
        Schema::create('checkin_sync_errors', function (Blueprint $table) {
            // BIGSERIAL PRIMARY KEY
            $table->bigIncrements('id');

            // Identifies which event the failed record belongs to.
            $table->string('event_id', 100)->nullable(false);

            // The ticket_id that could not be matched in the tickets table.
            $table->string('ticket_id', 100)->nullable(false);

            // Human-readable reason (e.g. "ticket not found in ExplaraX").
            $table->text('reason')->nullable(false);

            // Full CheckinRecord JSON for forensic audit.
            // Using json() — maps to JSONB on PostgreSQL via the pgsql driver.
            $table->json('payload')->nullable(false);

            // Append-only timestamp — no updated_at.
            $table->timestamp('created_at')->useCurrent()->nullable(false);

            // Named indexes matching the reference schema.
            $table->index('event_id', 'idx_sync_errors_event_id');
            $table->index('ticket_id', 'idx_sync_errors_ticket_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('checkin_sync_errors');
    }
};
