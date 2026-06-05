<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\DTOs\EventPreparationDTO;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Property 8: EventPreparation_Record is complete on successful sync.
 *
 * Task 12.4
 *
 * @group c1-attendee-sync
 */
class EventPreparationRecordPropertyTest extends TestCase
{
    use TestTrait;

    public function test_completed_dto_has_all_required_non_null_fields(): void
    {
        $this
            ->forAll(
                Generator::choose(1, 999999),  // event_id
                Generator::choose(1, 10000),   // attendee_count
                Generator::choose(1, 100)      // batch_count
            )
            ->withMaxSize(100)
            ->then(function (int $eventId, int $attendeeCount, int $batchCount) {
                $syncId = Str::uuid()->toString();

                $dto = EventPreparationDTO::completed($eventId, $syncId, $attendeeCount, $batchCount);

                $this->assertNotNull($dto->event_id,       'event_id must be non-null');
                $this->assertNotNull($dto->sync_id,        'sync_id must be non-null');
                $this->assertSame('completed', $dto->status, 'status must be "completed"');
                $this->assertNotNull($dto->prepared_at,    'prepared_at must be non-null');
                $this->assertNotNull($dto->attendee_count, 'attendee_count must be non-null');
                $this->assertNotNull($dto->batch_count,    'batch_count must be non-null');

                $this->assertSame($eventId,       $dto->event_id);
                $this->assertSame($syncId,        $dto->sync_id);
                $this->assertSame($attendeeCount, $dto->attendee_count);
                $this->assertSame($batchCount,    $dto->batch_count);
                $this->assertNull($dto->error_message, 'error_message must be null on success');
            });
    }
}
