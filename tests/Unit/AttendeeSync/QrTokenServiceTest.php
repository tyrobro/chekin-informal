<?php

declare(strict_types=1);

namespace Tests\Unit\AttendeeSync;

use App\Features\AttendeeSync\Services\QrTokenService;
use Tests\TestCase;

/**
 * @group c1-attendee-sync
 */
class QrTokenServiceTest extends TestCase
{
    private QrTokenService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new QrTokenService();
    }

    /** Task 4.3 — known HMAC-SHA256 test vectors */

    public function test_sign_returns_64_char_lowercase_hex(): void
    {
        $ticketId = 'ticket-123';
        $hmacKey  = str_repeat('a', 64); // valid 64-char hex (32 zero-bytes in hex)

        $token = $this->service->sign($ticketId, $hmacKey);

        $this->assertSame(64, strlen($token));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $token);
    }

    public function test_sign_produces_known_vector(): void
    {
        // Pre-computed: hash_hmac('sha256', 'ticket-001', hex2bin(str_repeat('0', 64)))
        $ticketId = 'ticket-001';
        $hmacKey  = str_repeat('0', 64); // 32 zero-bytes

        $expected = hash_hmac('sha256', $ticketId, hex2bin($hmacKey));
        $actual   = $this->service->sign($ticketId, $hmacKey);

        $this->assertSame($expected, $actual);
    }

    public function test_sign_is_deterministic_for_same_inputs(): void
    {
        $ticketId = 'evt-204-seat-A1';
        $hmacKey  = bin2hex(random_bytes(32));

        $token1 = $this->service->sign($ticketId, $hmacKey);
        $token2 = $this->service->sign($ticketId, $hmacKey);

        $this->assertSame($token1, $token2);
    }

    public function test_different_ticket_ids_produce_different_tokens(): void
    {
        $hmacKey = bin2hex(random_bytes(32));

        $token1 = $this->service->sign('ticket-A', $hmacKey);
        $token2 = $this->service->sign('ticket-B', $hmacKey);

        $this->assertNotSame($token1, $token2);
    }

    public function test_different_keys_produce_different_tokens(): void
    {
        $ticketId = 'ticket-999';
        $key1     = bin2hex(random_bytes(32));
        $key2     = bin2hex(random_bytes(32));

        $token1 = $this->service->sign($ticketId, $key1);
        $token2 = $this->service->sign($ticketId, $key2);

        // Very unlikely to collide
        $this->assertNotSame($token1, $token2);
    }
}
