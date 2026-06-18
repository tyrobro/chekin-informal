<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Contracts;

interface EventFinderContract
{
    /**
     * Return event_id strings for events where end_time < NOW()
     * AND sync_status <> 'complete'.
     *
     * @return string[]
     */
    public function findEligible(): array;
}
