<?php

declare(strict_types=1);

namespace App\Features\SyncBack\DTOs;

use App\Features\SyncBack\Http\Requests\SyncBackRequest;

/**
 * Carries the validated and typed request payload into the service layer.
 *
 * Built from a validated SyncBackRequest (after Laravel Form Request validation
 * has already passed), so no further input validation is performed here.
 *
 * Requirements: 2.1–2.6 (all validated fields), 8.1 (request_id for log correlation)
 */
readonly class SyncBackRequestDTO
{
    /**
     * @param CheckinRecordDTO[] $records
     */
    public function __construct(
        public string $event_id,
        public string $batch_id,
        public string $request_id,
        public array  $records,
    ) {}

    /**
     * Construct from a validated SyncBackRequest.
     * Converts each raw record array into a typed CheckinRecordDTO.
     */
    public static function fromRequest(SyncBackRequest $request, string $requestId): self
    {
        $records = array_map(
            static fn (array $item): CheckinRecordDTO => CheckinRecordDTO::fromArray($item),
            $request->validated('records')
        );

        return new self(
            event_id:   $request->validated('event_id'),
            batch_id:   $request->validated('batch_id'),
            request_id: $requestId,
            records:    $records,
        );
    }
}
