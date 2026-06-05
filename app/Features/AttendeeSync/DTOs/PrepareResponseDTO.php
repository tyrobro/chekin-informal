<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\DTOs;

use Carbon\Carbon;

readonly class PrepareResponseDTO
{
    public function __construct(
        public string $sync_id,    // UUID v4
        public string $status,     // e.g. "queued"
        public string $queued_at,  // ISO 8601 UTC timestamp
    ) {}

    /**
     * Factory method — sets queued_at to the current UTC time.
     */
    public static function make(string $syncId, string $status): self
    {
        return new self(
            sync_id:   $syncId,
            status:    $status,
            queued_at: Carbon::now()->toIso8601String(),
        );
    }

    /**
     * Serialise to array for JSON response.
     *
     * @return array{sync_id: string, status: string, queued_at: string}
     */
    public function toArray(): array
    {
        return [
            'sync_id'   => $this->sync_id,
            'status'    => $this->status,
            'queued_at' => $this->queued_at,
        ];
    }
}
