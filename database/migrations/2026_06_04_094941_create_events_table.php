<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Creates a minimal stub of the ExplaraX core `events` table.
     *
     * The authoritative events table lives in the ExplaraX monolith and contains
     * dozens of columns. This migration creates only the columns required by
     * EventFinderService (C3) to determine post-event sync eligibility:
     *
     *   - id:       primary key (referenced via CAST(id AS VARCHAR) in the eligibility query)
     *   - end_time: used to determine if an event has concluded (end_time < NOW())
     *
     * This stub ensures the test schema is sufficient for EventFinderService
     * integration tests without importing the full monolith schema.
     */
    public function up(): void
    {
        Schema::create('events', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->timestampTz('end_time')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};
