<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\DTOs;

use Carbon\Carbon;

readonly class EventPreparationDTO
{
    public function __construct(
        public int     $event_id,
        public string  $sync_id,          // UUID v4
        public string  $status,           // pending | in_progress | completed | failed
        public ?string $prepared_at,      // ISO 8601 UTC or null
        public ?int    $attendee_count,
        public ?int    $batch_count,
        public ?string $error_message,
    ) {}

    /**
     * Factory: marks a sync as in-progress with nullable result fields.
     */
    public static function inProgress(int $eventId, string $syncId): self
    {
        return new self(
            event_id:       $eventId,
            sync_id:        $syncId,
            status:         'in_progress',
            prepared_at:    null,
            attendee_count: null,
            batch_count:    null,
            error_message:  null,
        );
    }

    /**
     * Factory: marks a sync as completed with attendee and batch counts.
     */
    public static function completed(
        int    $eventId,
        string $syncId,
        int    $attendeeCount,
        int    $batchCount,
    ): self {
        return new self(
            event_id:       $eventId,
            sync_id:        $syncId,
            status:         'completed',
            prepared_at:    Carbon::now()->toIso8601String(),
            attendee_count: $attendeeCount,
            batch_count:    $batchCount,
            error_message:  null,
        );
    }

    /**
     * Factory: marks a sync as failed with an error message.
     */
    public static function failed(int $eventId, string $syncId, string $errorMessage): self
    {
        return new self(
            event_id:       $eventId,
            sync_id:        $syncId,
            status:         'failed',
            prepared_at:    Carbon::now()->toIso8601String(),
            attendee_count: null,
            batch_count:    null,
            error_message:  $errorMessage,
        );
    }

    /**
     * Serialise all 7 fields to an associative array.
     *
     * @return array{
     *   event_id: int,
     *   sync_id: string,
     *   status: string,
     *   prepared_at: string|null,
     *   attendee_count: int|null,
     *   batch_count: int|null,
     *   error_message: string|null
     * }
     */
    public function toArray(): array
    {
        return [
            'event_id'       => $this->event_id,
            'sync_id'        => $this->sync_id,
            'status'         => $this->status,
            'prepared_at'    => $this->prepared_at,
            'attendee_count' => $this->attendee_count,
            'batch_count'    => $this->batch_count,
            'error_message'  => $this->error_message,
        ];
    }
}
