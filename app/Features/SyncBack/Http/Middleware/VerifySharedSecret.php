<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates inbound sync-back requests using a shared-secret Bearer token.
 *
 * Security properties:
 * - Uses hash_equals() for constant-time comparison (prevents timing attacks).
 * - Fails closed: returns 401 if CHECKIN_SYNC_BACK_SECRET is empty/unset.
 * - Never logs the secret value.
 * - Assigns a request_id (from X-Request-Id header or a generated UUID v4)
 *   for log correlation throughout the request lifecycle.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
class VerifySharedSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $authHeader = $request->header('Authorization', '');

        // Require "Bearer <token>" format
        if (! str_starts_with((string) $authHeader, 'Bearer ')) {
            return $this->unauthorized();
        }

        $token = substr((string) $authHeader, 7); // strip "Bearer "

        if ($token === '') {
            return $this->unauthorized();
        }

        $configSecret = (string) config('services.checkin_sync_back.secret', '');

        // Fail closed: if the secret is not configured, deny all requests.
        if ($configSecret === '') {
            return $this->unauthorized();
        }

        // Constant-time comparison — prevents timing-attack leakage.
        if (! hash_equals($configSecret, $token)) {
            return $this->unauthorized();
        }

        // Resolve correlation ID: prefer caller-supplied header, generate if absent.
        $requestId = $request->header('X-Request-Id') ?? (string) Str::uuid();
        $request->attributes->set('request_id', $requestId);

        return $next($request);
    }

    /**
     * Return a consistent 401 response. Never exposes secret values.
     */
    private function unauthorized(): Response
    {
        return response()->json(['error' => 'Unauthorized'], 401);
    }
}
