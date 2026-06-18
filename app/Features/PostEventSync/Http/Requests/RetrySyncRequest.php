<?php

declare(strict_types=1);

namespace App\Features\PostEventSync\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Form request for POST /internal/checkin/retry-sync/{event_id}.
 *
 * Authentication is handled upstream by the VerifySharedSecret middleware
 * (reused from C2), so authorize() unconditionally returns true here.
 *
 * The event_id comes from the route parameter — no body validation needed.
 *
 * Requirements: 6.4, 6.5
 */
class RetrySyncRequest extends FormRequest
{
    /**
     * Authentication is enforced by the VerifySharedSecret middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * No body fields to validate — event_id is a route parameter.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
