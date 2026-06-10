<?php

declare(strict_types=1);

namespace Tests\Unit\Features\SyncBack;

use App\Features\SyncBack\DTOs\CheckinRecordDTO;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for CheckinRecordDTO.
 *
 * Requirements: 2.4
 */
class CheckinRecordDTOTest extends TestCase
{
    private array $validData = [
        'ticket_id'       => 'E4CACB-177',
        'checked_in_at'   => '2026-06-15T09:14:23Z',
        'checked_in_gate' => 'Gate A',
        'checked_in_by'   => 'staff-uuid-001',
        'checkin_method'  => 'qr_scan',
    ];

    public function test_from_array_sets_all_properties_correctly(): void
    {
        $dto = CheckinRecordDTO::fromArray($this->validData);

        $this->assertSame('E4CACB-177', $dto->ticket_id);
        $this->assertSame('2026-06-15T09:14:23Z', $dto->checked_in_at);
        $this->assertSame('Gate A', $dto->checked_in_gate);
        $this->assertSame('staff-uuid-001', $dto->checked_in_by);
        $this->assertSame('qr_scan', $dto->checkin_method);
    }

    /**
     * @dataProvider checkinMethodProvider
     */
    public function test_all_checkin_methods_accepted(string $method): void
    {
        $dto = CheckinRecordDTO::fromArray(array_merge($this->validData, ['checkin_method' => $method]));

        $this->assertSame($method, $dto->checkin_method);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function checkinMethodProvider(): array
    {
        return [
            'qr_scan' => ['qr_scan'],
            'manual'  => ['manual'],
            'nfc'     => ['nfc'],
        ];
    }

    public function test_to_array_returns_all_fields(): void
    {
        $dto    = CheckinRecordDTO::fromArray($this->validData);
        $result = $dto->toArray();

        $this->assertArrayHasKey('ticket_id', $result);
        $this->assertArrayHasKey('checked_in_at', $result);
        $this->assertArrayHasKey('checked_in_gate', $result);
        $this->assertArrayHasKey('checked_in_by', $result);
        $this->assertArrayHasKey('checkin_method', $result);
        $this->assertSame($this->validData, $result);
    }

    public function test_from_array_handles_missing_keys_with_empty_strings(): void
    {
        $dto = CheckinRecordDTO::fromArray([]);

        $this->assertSame('', $dto->ticket_id);
        $this->assertSame('', $dto->checked_in_at);
        $this->assertSame('', $dto->checked_in_gate);
        $this->assertSame('', $dto->checked_in_by);
        $this->assertSame('', $dto->checkin_method);
    }
}
