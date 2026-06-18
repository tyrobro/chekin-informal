<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Exceptions;

/**
 * Thrown by RetryService when a manual retry is requested for an event whose
 * sync_status is "in_progress" (i.e. a sync is currently running).
 *
 * Maps to HTTP 409 Conflict via the PostEventSyncServiceProvider exception
 * handler, returning: {"error": "sync_already_in_progress"}
 */
class SyncAlreadyInProgressException extends PostEventSyncException
{
}
