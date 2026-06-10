<?php

declare(strict_types=1);

namespace Tests\Unit\Features\SyncBack;

use App\Features\SyncBack\DTOs\SyncBackResponseDTO;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for SyncBackResponseDTO.
 *
 * Requirements: 6.1–6.6
 * Correctness Property 1: Response Count Invariant
 */
class SyncBackResponseDTOTest extends TestCase
{
    private const BATCH_ID = '550e8400-e29b-41d4-a716-446655440000';

    public function test_initial_state_is_zero_counts(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 5);

        $this->assertSame(0, $dto->getSucceeded());
        $this->assertSame(0, $dto->getFailed());
        $this->assertSame([], $dto->getFailures());
    }

    public function test_record_success_increments_succeeded(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 3);

        $dto->recordSuccess();
        $dto->recordSuccess();
        $dto->recordSuccess();

        $this->assertSame(3, $dto->getSucceeded());
        $this->assertSame(0, $dto->getFailed());
    }

    public function test_record_failure_increments_failed_and_appends_failure(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 1);

        $dto->recordFailure('T1', 'ticket not found in ExplaraX');

        $this->assertSame(1, $dto->getFailed());
        $this->assertCount(1, $dto->getFailures());
        $this->assertSame('T1', $dto->getFailures()[0]->ticket_id);
        $this->assertSame('ticket not found in ExplaraX', $dto->getFailures()[0]->reason);
    }

    public function test_to_array_matches_contract_shape(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 2);
        $dto->recordSuccess();
        $dto->recordFailure('BAD-001', 'ticket not found in ExplaraX');

        $result = $dto->toArray();

        $this->assertArrayHasKey('batch_id', $result);
        $this->assertArrayHasKey('succeeded', $result);
        $this->assertArrayHasKey('failed', $result);
        $this->assertArrayHasKey('total', $result);
        $this->assertArrayHasKey('failures', $result);
        $this->assertSame(self::BATCH_ID, $result['batch_id']);
        $this->assertSame(2, $result['total']);
    }

    public function test_failures_array_length_equals_failed_count(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 3);
        $dto->recordFailure('T1', 'reason');
        $dto->recordFailure('T2', 'reason');
        $dto->recordFailure('T3', 'reason');

        $result = $dto->toArray();

        $this->assertCount(3, $result['failures']);
        $this->assertSame(3, $result['failed']);
    }

    public function test_succeeded_plus_failed_equals_total_invariant(): void
    {
        $total = 10;
        $dto   = new SyncBackResponseDTO(self::BATCH_ID, $total);

        for ($i = 0; $i < 7; $i++) {
            $dto->recordSuccess();
        }
        for ($i = 0; $i < 3; $i++) {
            $dto->recordFailure("T{$i}", 'reason');
        }

        $result = $dto->toArray();
        $this->assertSame($total, $result['succeeded'] + $result['failed']);
        $this->assertSame($total, $result['total']);
    }

    public function test_failures_array_is_empty_when_failed_is_zero(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 2);
        $dto->recordSuccess();
        $dto->recordSuccess();

        $result = $dto->toArray();

        $this->assertSame([], $result['failures']);
        $this->assertSame(0, $result['failed']);
    }

    public function test_failures_are_serialised_to_arrays_in_to_array(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 1);
        $dto->recordFailure('BAD-001', 'ticket not found in ExplaraX');

        $result = $dto->toArray();

        $this->assertIsArray($result['failures'][0]);
        $this->assertSame('BAD-001', $result['failures'][0]['ticket_id']);
        $this->assertSame('ticket not found in ExplaraX', $result['failures'][0]['reason']);
    }

    public function test_batch_id_is_echoed_in_response(): void
    {
        $dto = new SyncBackResponseDTO(self::BATCH_ID, 1);
        $dto->recordSuccess();

        $this->assertSame(self::BATCH_ID, $dto->toArray()['batch_id']);
    }
}
