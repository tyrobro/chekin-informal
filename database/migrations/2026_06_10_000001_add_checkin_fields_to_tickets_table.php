<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds four nullable check-in columns and a partial index to the tickets
     * table. These columns are written by the C2 sync-back endpoint after a
     * live check-in event concludes.
     *
     * Separated from create_tickets_table because:
     * - The tickets table was created by C1 (attendee sync).
     * - The check-in fields are a C2 concern and were not present at C1 deploy time.
     * - Keeping schema changes in a dedicated migration preserves the ability
     *   to roll back C2 independently of C1.
     *
     * Equivalent SQL:
     *   ALTER TABLE tickets
     *       ADD COLUMN checked_in_at   TIMESTAMPTZ  DEFAULT NULL,
     *       ADD COLUMN checked_in_gate VARCHAR(100) DEFAULT NULL,
     *       ADD COLUMN checked_in_by   VARCHAR(255) DEFAULT NULL,
     *       ADD COLUMN checkin_method  VARCHAR(50)  DEFAULT NULL;
     *
     *   CREATE INDEX idx_tickets_checked_in_at
     *       ON tickets (checked_in_at)
     *       WHERE checked_in_at IS NOT NULL;
     *
     * Requirements: 3.2, 3.3
     */
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->timestamp('checked_in_at')->nullable()->default(null);
            $table->string('checked_in_gate', 100)->nullable()->default(null);
            $table->string('checked_in_by', 255)->nullable()->default(null);
            $table->string('checkin_method', 50)->nullable()->default(null);
        });

        // Partial index — Blueprint doesn't support WHERE clauses, use raw SQL.
        DB::statement(
            'CREATE INDEX idx_tickets_checked_in_at ON tickets (checked_in_at) WHERE checked_in_at IS NOT NULL'
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS idx_tickets_checked_in_at');

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn(['checked_in_at', 'checked_in_gate', 'checked_in_by', 'checkin_method']);
        });
    }
};
