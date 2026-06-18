<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Exceptions;

/**
 * Thrown by RetryService when a manual retry is requested for an event whose
 * sync_status is already "complete".
 *
 * Maps to HTTP 409 Conflict via the PostEventSyncServiceProvider exception
 * handler, returning: {"error": "sync_already_complete"}
 */
class SyncAlreadyCompleteException extends PostEventSyncException
{
}
