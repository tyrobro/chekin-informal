<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Release memory after each test to keep the full suite under 128 MB.
     *
     * The primary memory retention sources in this suite are:
     * 1. Laravel's HTTP client recording (stores all request/response pairs)
     * 2. Resolved singleton instances in the service container
     * 3. PHPUnit retaining test instances with response data
     *
     * This tearDown aggressively cleans up between tests so the 10K-record
     * SyncBack tests don't push accumulated memory past 128 MB.
     */
    protected function tearDown(): void
    {
        parent::tearDown();

        // Clear HTTP client state — recorded requests accumulate across the suite.
        // This is the single largest source of memory growth in HTTP-heavy test suites.
        try {
            $factory = $this->app?->make(\Illuminate\Http\Client\Factory::class);
            if ($factory && method_exists($factory, 'recorded')) {
                // The factory has a recorded[] array that grows unbounded.
                // Access via reflection to clear it.
                $ref = new \ReflectionClass($factory);
                foreach (['record', 'recorded', 'responseSequence', 'stubCallbacks'] as $prop) {
                    if ($ref->hasProperty($prop)) {
                        $p = $ref->getProperty($prop);
                        $p->setAccessible(true);
                        $p->setValue($factory, []);
                    }
                }
            }
        } catch (\Throwable) {}

        // Collect garbage — handles circular references from DTOs and collections
        gc_collect_cycles();
    }
}
