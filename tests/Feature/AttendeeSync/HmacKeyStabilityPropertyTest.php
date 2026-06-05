<?php

declare(strict_types=1);

namespace Tests\Feature\AttendeeSync;

use App\Features\AttendeeSync\Repositories\PostgresHmacKeyRepository;
use Eris\Generators as Generator;
use Eris\TestTrait;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Property 4: HMAC key is stable across repeated calls.
 *
 * @group c1-attendee-sync
 */
class HmacKeyStabilityPropertyTest extends TestCase
{
    use TestTrait;
    use RefreshDatabase;

    private PostgresHmacKeyRepository $repo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repo = new PostgresHmacKeyRepository();
        // DB is PostgreSQL test database (configured in phpunit.xml)
        // RefreshDatabase trait handles migration and cleanup
    }

    public function test_get_or_create_returns_same_key_on_repeated_calls(): void
    {
        $this
            ->forAll(
                Generator::choose(1, 999999) // random event_id
            )
            ->withMaxSize(100)
            ->then(function (int $eventId) {
                // First call — creates the key
                $key1 = $this->repo->getOrCreate($eventId);
                // Second call — must return the identical key
                $key2 = $this->repo->getOrCreate($eventId);
                // Third call — still the same
                $key3 = $this->repo->getOrCreate($eventId);

                $this->assertSame($key1, $key2, 'Key must be stable on second call');
                $this->assertSame($key1, $key3, 'Key must be stable on third call');
                $this->assertSame(64, strlen($key1), 'Key must be 64 chars');

                // Clean up for next iteration so event_ids don't collide
                \Illuminate\Support\Facades\DB::table('event_hmac_keys')
                    ->where('event_id', $eventId)
                    ->delete();
            });
    }
}
