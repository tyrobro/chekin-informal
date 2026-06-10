<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\Services\QrTokenService;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Property 5: QR token is deterministic for any (ticket_id, hmac_key) pair.
 *
 * @group c1-attendee-sync
 */
class QrTokenDeterminismPropertyTest extends TestCase
{
    use TestTrait;

    private QrTokenService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new QrTokenService();
    }

    public function test_qr_token_is_deterministic_for_any_ticket_id_and_key(): void
    {
        $this
            ->forAll(
                Generator::string(),          // any ticket_id
                Generator::elements(...$this->hex64Keys()) // a 64-char hex key
            )
            ->withMaxSize(200)
            ->then(function (string $ticketId, string $hmacKey) {
                $token1 = $this->service->sign($ticketId, $hmacKey);
                $token2 = $this->service->sign($ticketId, $hmacKey);

                $this->assertSame($token1, $token2, 'Same inputs must always produce the same token');
                $this->assertSame(64, strlen($token1), 'Token must always be 64 characters');
                $this->assertMatchesRegularExpression(
                    '/^[0-9a-f]{64}$/',
                    $token1,
                    'Token must be lowercase hex'
                );
            });
    }

    /**
     * Generate a pool of valid 64-char hex keys to pick from.
     * Eris does not have a built-in 64-char hex generator, so we pre-generate 50.
     */
    private function hex64Keys(): array
    {
        return array_map(fn() => bin2hex(random_bytes(32)), range(1, 50));
    }
}
