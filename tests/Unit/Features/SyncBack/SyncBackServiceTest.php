<?php

declare(strict_types=1);

namespace Tests\Unit\Features\SyncBack;

use App\Features\SyncBack\Contracts\SyncErrorRepository;
use App\Features\SyncBack\Contracts\TicketRepository;
use App\Features\SyncBack\DTOs\CheckinRecordDTO;
use App\Features\SyncBack\DTOs\SyncBackRequestDTO;
use App\Features\SyncBack\Services\SyncBackService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

/**
 * Unit tests for SyncBackService.
 *
 * Repositories are mocked — no database connection required.
 *
 * Requirements: 3.1–3.5, 4.1–4.4, 5.1–5.3
 * Correctness Properties: 1–5
 */
class SyncBackServiceTest extends TestCase
{
    private TicketRepository&MockObject    $ticketRepo;
    private SyncErrorRepository&MockObject $syncErrorRepo;
    private SyncBackService                $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ticketRepo    = $this->createMock(TicketRepository::class);
        $this->syncErrorRepo = $this->createMock(SyncErrorRepository::class);
        $this->service       = new SyncBackService($this->ticketRepo, $this->syncErrorRepo, new NullLogger());
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function makeRecord(string $ticketId, string $checkedInAt = '2026-06-15T09:14:23Z'): CheckinRecordDTO
    {
        return new CheckinRecordDTO(
            ticket_id:       $ticketId,
            checked_in_at:   $checkedInAt,
            checked_in_gate: 'Gate A',
            checked_in_by:   'staff-uuid',
            checkin_method:  'qr_scan',
        );
    }

    private function makeDTO(array $records): SyncBackRequestDTO
    {
        return new SyncBackRequestDTO(
            event_id:   'TCS-10K-2026',
            batch_id:   '550e8400-e29b-41d4-a716-446655440000',
            request_id: 'req-001',
            records:    $records,
        );
    }

    private function makeExistingRow(string $ticketId, ?string $checkedInAt = null): \stdClass
    {
        $row              = new \stdClass();
        $row->ticket_id   = $ticketId;
        $row->checked_in_at = $checkedInAt;
        return $row;
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    public function test_all_valid_records_returns_all_succeeded(): void
    {
        $records = [$this->makeRecord('T1'), $this->makeRecord('T2'), $this->makeRecord('T3')];
        $dto     = $this->makeDTO($records);

        $this->ticketRepo
            ->method('findByTicketIds')
            ->willReturn([
                'T1' => $this->makeExistingRow('T1'),
                'T2' => $this->makeExistingRow('T2'),
                'T3' => $this->makeExistingRow('T3'),
            ]);

        $response = $this->service->process($dto);

        $this->assertSame(3, $response->getSucceeded());
        $this->assertSame(0, $response->getFailed());
    }

    public function test_all_invalid_records_returns_all_failed(): void
    {
        $records = [$this->makeRecord('BAD-1'), $this->makeRecord('BAD-2')];
        $dto     = $this->makeDTO($records);

        $this->ticketRepo
            ->method('findByTicketIds')
            ->willReturn([]); // Nothing found

        $response = $this->service->process($dto);

        $this->assertSame(0, $response->getSucceeded());
        $this->assertSame(2, $response->getFailed());
    }

    public function test_mixed_batch_returns_correct_split(): void
    {
        $records = array_merge(
            array_map(fn (int $i): CheckinRecordDTO => $this->makeRecord("VALID-{$i}"), range(1, 7)),
            array_map(fn (int $i): CheckinRecordDTO => $this->makeRecord("BAD-{$i}"), range(1, 3)),
        );
        $dto = $this->makeDTO($records);

        $existingMap = [];
        for ($i = 1; $i <= 7; $i++) {
            $existingMap["VALID-{$i}"] = $this->makeExistingRow("VALID-{$i}");
        }

        $this->ticketRepo->method('findByTicketIds')->willReturn($existingMap);

        $response = $this->service->process($dto);

        $this->assertSame(7, $response->getSucceeded());
        $this->assertSame(3, $response->getFailed());
    }

    public function test_duplicate_records_counted_as_succeeded_not_failed(): void
    {
        $record  = $this->makeRecord('T1', '2026-06-15T09:14:23Z');
        $dto     = $this->makeDTO([$record]);

        // Existing row has the SAME checked_in_at → duplicate
        $this->ticketRepo
            ->method('findByTicketIds')
            ->willReturn(['T1' => $this->makeExistingRow('T1', '2026-06-15T09:14:23Z')]);

        $response = $this->service->process($dto);

        $this->assertSame(1, $response->getSucceeded());
        $this->assertSame(0, $response->getFailed());
    }

    public function test_duplicate_records_do_not_trigger_bulk_update(): void
    {
        $record = $this->makeRecord('T1', '2026-06-15T09:14:23Z');
        $dto    = $this->makeDTO([$record]);

        $this->ticketRepo
            ->method('findByTicketIds')
            ->willReturn(['T1' => $this->makeExistingRow('T1', '2026-06-15T09:14:23Z')]);

        // bulkUpdateCheckinFields must NEVER be called for duplicates
        $this->ticketRepo
            ->expects($this->never())
            ->method('bulkUpdateCheckinFields');

        $this->service->process($dto);
    }

    public function test_invalid_tickets_trigger_bulk_error_insert(): void
    {
        $record = $this->makeRecord('BAD-001');
        $dto    = $this->makeDTO([$record]);

        $this->ticketRepo->method('findByTicketIds')->willReturn([]);

        $this->syncErrorRepo
            ->expects($this->once())
            ->method('bulkInsert')
            ->with($this->callback(function (array $errors): bool {
                $this->assertCount(1, $errors);
                $this->assertSame('BAD-001', $errors[0]['ticket_id']);
                $this->assertSame('ticket not found in ExplaraX', $errors[0]['reason']);
                $this->assertArrayHasKey('event_id', $errors[0]);
                $this->assertArrayHasKey('payload', $errors[0]);
                $this->assertArrayHasKey('created_at', $errors[0]);
                return true;
            }));

        $this->service->process($dto);
    }

    public function test_valid_records_trigger_bulk_update(): void
    {
        $record = $this->makeRecord('T1');
        $dto    = $this->makeDTO([$record]);

        $this->ticketRepo
            ->method('findByTicketIds')
            ->willReturn(['T1' => $this->makeExistingRow('T1')]); // null checked_in_at → to-update

        $this->ticketRepo
            ->expects($this->once())
            ->method('bulkUpdateCheckinFields')
            ->with($this->callback(function (array $records): bool {
                $this->assertCount(1, $records);
                $this->assertSame('T1', $records[0]->ticket_id);
                return true;
            }));

        $this->service->process($dto);
    }

    public function test_response_invariant_succeeded_plus_failed_equals_total(): void
    {
        $records = array_merge(
            array_map(fn (int $i): CheckinRecordDTO => $this->makeRecord("V-{$i}"), range(1, 6)),
            array_map(fn (int $i): CheckinRecordDTO => $this->makeRecord("B-{$i}"), range(1, 4)),
        );
        $dto = $this->makeDTO($records);

        $existingMap = [];
        for ($i = 1; $i <= 6; $i++) {
            $existingMap["V-{$i}"] = $this->makeExistingRow("V-{$i}");
        }
        $this->ticketRepo->method('findByTicketIds')->willReturn($existingMap);

        $response = $this->service->process($dto);

        $this->assertSame(
            count($records),
            $response->getSucceeded() + $response->getFailed(),
            'succeeded + failed must equal total'
        );
    }

    public function test_failures_array_length_equals_failed_count(): void
    {
        $records = array_map(fn (int $i): CheckinRecordDTO => $this->makeRecord("B-{$i}"), range(1, 5));
        $dto     = $this->makeDTO($records);

        $this->ticketRepo->method('findByTicketIds')->willReturn([]);

        $response = $this->service->process($dto);

        $this->assertCount($response->getFailed(), $response->getFailures());
    }

    public function test_all_duplicate_batch_does_not_call_bulk_update_or_insert(): void
    {
        $records = [
            $this->makeRecord('T1', '2026-06-15T09:14:23Z'),
            $this->makeRecord('T2', '2026-06-15T09:14:23Z'),
        ];
        $dto = $this->makeDTO($records);

        $this->ticketRepo->method('findByTicketIds')->willReturn([
            'T1' => $this->makeExistingRow('T1', '2026-06-15T09:14:23Z'),
            'T2' => $this->makeExistingRow('T2', '2026-06-15T09:14:23Z'),
        ]);

        $this->ticketRepo->expects($this->never())->method('bulkUpdateCheckinFields');
        $this->syncErrorRepo->expects($this->never())->method('bulkInsert');

        $response = $this->service->process($dto);

        $this->assertSame(2, $response->getSucceeded());
        $this->assertSame(0, $response->getFailed());
    }
}
