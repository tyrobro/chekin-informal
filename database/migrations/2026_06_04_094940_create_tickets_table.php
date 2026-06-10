<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Creates the core tickets table that holds per-ticket attendee data
     * from ExplaraX. This is the table that C2 sync-back writes check-in
     * fields back into.
     *
     * Columns that carry PII (email, phone, payment_*) are intentionally
     * excluded — per the C1 spec only the fields listed in Section 4 are stored.
     *
     * Requirements C2: 3.2 (fields updated by sync-back)
     */
    public function up(): void
    {
        Schema::create('tickets', function (Blueprint $table) {
            // Primary key — internal auto-increment
            $table->bigIncrements('id');

            // ExplaraX ticket identifier — the natural key used in all operations
            $table->string('ticket_id', 100)->unique();

            // Event this ticket belongs to
            $table->string('event_id', 100)->nullable();

            // Attendee metadata (non-PII fields only)
            $table->string('attendee_name', 255)->nullable();
            $table->string('ticket_type', 100)->nullable();
            $table->string('company', 255)->nullable();
            $table->string('designation', 255)->nullable();
            $table->string('seat', 100)->nullable();
            $table->json('metadata')->nullable();

            // QR token (HMAC-signed, generated at sync time)
            $table->string('qr_token', 255)->nullable();

            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();

            // Indexes for common query patterns
            $table->index('event_id', 'idx_tickets_event_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tickets');
    }
};
