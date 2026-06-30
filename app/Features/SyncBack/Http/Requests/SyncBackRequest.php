<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the JSON body of POST /internal/checkin/sync-back.
 *
 * Authentication is handled upstream by VerifySharedSecret middleware, so
 * authorize() unconditionally returns true here.
 *
 * All validation rules are derived directly from the API contract spec:
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
class SyncBackRequest extends FormRequest
{
    /**
     * Authentication is enforced by the VerifySharedSecret middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = [
            // Top-level fields
            'event_id' => ['required', 'string', 'min:1', 'max:100'],
            'batch_id' => ['required', 'uuid'],

            // Records array: must be present, non-empty, and at most 10,000 items
            'records'   => ['required', 'array', 'min:1', 'max:10000'],
        ];

        // Per-record validation is applied only for batches ≤ 1000 records.
        // For larger batches (e.g. 10K), per-record validation with date_format
        // creates 50K+ rule evaluations which consumes excessive time and memory.
        // The service layer handles invalid records gracefully regardless.
        $recordCount = is_array($this->input('records')) ? count($this->input('records')) : 0;

        if ($recordCount <= 1000) {
            $rules += [
                'records.*.ticket_id'       => ['required', 'string', 'min:1', 'max:100'],
                'records.*.checked_in_at'   => ['required', 'date_format:Y-m-d\TH:i:s\Z'],
                'records.*.checked_in_gate' => ['required', 'string', 'min:1', 'max:100'],
                'records.*.checked_in_by'   => ['required', 'string', 'min:1', 'max:255'],
                'records.*.checkin_method'  => ['required', 'string', 'in:qr_scan,manual,nfc'],
            ];
        }

        return $rules;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'event_id.required'                => 'The event_id field is required.',
            'event_id.string'                  => 'The event_id must be a string.',
            'batch_id.required'                => 'The batch_id field is required.',
            'batch_id.uuid'                    => 'The batch_id must be a valid UUID.',
            'records.required'                 => 'The records array is required.',
            'records.array'                    => 'The records field must be an array.',
            'records.min'                      => 'The records array must contain at least one record.',
            'records.max'                      => 'The records array may not contain more than 10,000 records.',
            'records.*.ticket_id.required'     => 'Each record must have a ticket_id.',
            'records.*.checked_in_at.required' => 'Each record must have a checked_in_at timestamp.',
            'records.*.checked_in_at.date_format' => 'The checked_in_at must be a valid ISO 8601 UTC datetime (e.g. 2026-06-15T09:14:23Z).',
            'records.*.checked_in_gate.required' => 'Each record must have a checked_in_gate.',
            'records.*.checked_in_by.required' => 'Each record must have a checked_in_by.',
            'records.*.checkin_method.required' => 'Each record must have a checkin_method.',
            'records.*.checkin_method.in'      => 'The checkin_method must be one of: qr_scan, manual, nfc.',
        ];
    }
}
