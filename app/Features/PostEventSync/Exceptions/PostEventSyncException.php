<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Exceptions;

/**
 * Base exception for all C3 Post-Event Sync failures.
 *
 * Thrown by the PostEventSyncOrchestrator and SyncBackDispatcher when a
 * permanent, unrecoverable error occurs during the automated sync pipeline
 * (e.g. a batch fails all retry attempts). Subclasses represent specific
 * guard conditions in the manual retry path.
 */
class PostEventSyncException extends \RuntimeException
{
}
