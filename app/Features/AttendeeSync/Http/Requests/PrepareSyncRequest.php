<?php

declare(strict_types=1);

namespace App\Features\AttendeeSync\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the event_id route parameter for the prepare endpoint.
 *
 * Requirements: 2.2, 2.3
 */
class PrepareSyncRequest extends FormRequest
{
    /**
     * All internal/checkin endpoints are considered pre-authorised at the network level.
     * Add IP-allowlist or token middleware at the route level if needed.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Merge the route parameter into the validation data so it can be validated.
     */
    protected function prepareForValidation(): void
    {
        $this->merge(['event_id' => $this->route('event_id')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'event_id' => ['required', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'event_id.required' => 'The event_id parameter is required.',
            'event_id.integer'  => 'The event_id must be an integer.',
            'event_id.min'      => 'The event_id must be a positive integer (>= 1).',
        ];
    }
}
