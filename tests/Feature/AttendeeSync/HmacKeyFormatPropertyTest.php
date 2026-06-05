<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use Eris\Generators as Generator;
use Eris\TestTrait;
use Tests\TestCase;

/**
 * Property 3: HMAC key is always a 64-character lowercase hex string.
 *
 * @group c1-attendee-sync
 */
class HmacKeyFormatPropertyTest extends TestCase
{
    use TestTrait;

    public function test_generated_hmac_key_is_always_64_char_lowercase_hex(): void
    {
        $this
            ->forAll(
                Generator::choose(1, 200) // just a counter to drive iterations
            )
            ->withMaxSize(200)
            ->then(function (int $_) {
                $key = bin2hex(random_bytes(32));

                $this->assertSame(64, strlen($key), 'HMAC key must be exactly 64 characters');
                $this->assertMatchesRegularExpression(
                    '/^[0-9a-f]{64}$/',
                    $key,
                    'HMAC key must be lowercase hex only'
                );
            });
    }
}
