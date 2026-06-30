<?php

declare(strict_types=1);

namespace App\Features\SyncBack\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

/**
 * Validates the JSON body of POST /internal/checkin/sync-back.
 *
 * Authentication is handled upstream by VerifySharedSecret middleware, so
 * authorize() unconditionally returns true here.
 *
 * IMPORTANT – Memory-efficient validation strategy:
 *
 * 1. Wildcard rules (records.*.field) are NOT used because Laravel's
 *    ValidationRuleParser::explodeWildcardRules() expands them into 50,000+
 *    individual rules for a 10K-record batch, exhausting memory.
 *
 * 2. Per-record Validator::make() instances are NOT used because 10,000
 *    Validator objects accumulate ~20 MB of heap that is not freed promptly,
 *    causing subsequent test methods to OOM.
 *
 * 3. Instead, per-record validation uses lightweight inline PHP checks with
 *    zero object allocation per record. This keeps memory O(1) per record.
 *
 * All validation rules are derived directly from the API contract spec:
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
class SyncBackRequest extends FormRequest
{
    private const VALID_CHECKIN_METHODS = ['qr_scan', 'manual', 'nfc'];

    /**
     * ISO 8601 UTC datetime pattern: YYYY-MM-DDTHH:MM:SSZ
     */
    private const ISO8601_UTC_PATTERN = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/';

    /**
     * Authentication is enforced by the VerifySharedSecret middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Top-level validation rules only.
     *
     * Individual record validation is deferred to passedValidation() using
     * lightweight inline checks (no Validator instances, no wildcard rules).
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'event_id' => ['required', 'string', 'min:1', 'max:100'],
            'batch_id' => ['required', 'uuid'],
            'records'  => ['required', 'array', 'min:1', 'max:10000'],
        ];
    }

    /**
     * Return only the JSON input for validation, avoiding the expensive
     * array_replace_recursive($this->input(), $this->allFiles()) call in
     * the parent's all() method. This endpoint never receives file uploads,
     * so merging with allFiles() is unnecessary and would create another
     * full copy of the 10K-record array.
     *
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        return $this->json()->all();
    }

    /**
     * After top-level validation passes, validate individual records using
     * lightweight inline PHP checks. No Validator objects are instantiated.
     *
     * Memory cost: a single $errors array that only grows when there ARE errors
     * (which in practice is 0 for valid batches and small for invalid ones).
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    protected function passedValidation(): void
    {
        $records = $this->input('records', []);
        $errors  = [];

        foreach ($records as $index => $record) {
            if (! is_array($record)) {
                $errors["records.{$index}"] = ["The records.{$index} field must be an array."];
                continue;
            }

            // ticket_id: required, string, 1–100 chars
            if (! isset($record['ticket_id']) || ! is_string($record['ticket_id']) || $record['ticket_id'] === '') {
                $errors["records.{$index}.ticket_id"] = ['Each record must have a ticket_id.'];
            } elseif (strlen($record['ticket_id']) > 100) {
                $errors["records.{$index}.ticket_id"] = ['The ticket_id may not be greater than 100 characters.'];
            }

            // checked_in_at: required, ISO 8601 UTC format (Y-m-d\TH:i:s\Z)
            if (! isset($record['checked_in_at']) || ! is_string($record['checked_in_at']) || $record['checked_in_at'] === '') {
                $errors["records.{$index}.checked_in_at"] = ['Each record must have a checked_in_at timestamp.'];
            } elseif (! preg_match(self::ISO8601_UTC_PATTERN, $record['checked_in_at'])) {
                $errors["records.{$index}.checked_in_at"] = ['The checked_in_at must be a valid ISO 8601 UTC datetime (e.g. 2026-06-15T09:14:23Z).'];
            }

            // checked_in_gate: required, string, 1–100 chars
            if (! isset($record['checked_in_gate']) || ! is_string($record['checked_in_gate']) || $record['checked_in_gate'] === '') {
                $errors["records.{$index}.checked_in_gate"] = ['Each record must have a checked_in_gate.'];
            } elseif (strlen($record['checked_in_gate']) > 100) {
                $errors["records.{$index}.checked_in_gate"] = ['The checked_in_gate may not be greater than 100 characters.'];
            }

            // checked_in_by: required, string, 1–255 chars
            if (! isset($record['checked_in_by']) || ! is_string($record['checked_in_by']) || $record['checked_in_by'] === '') {
                $errors["records.{$index}.checked_in_by"] = ['Each record must have a checked_in_by.'];
            } elseif (strlen($record['checked_in_by']) > 255) {
                $errors["records.{$index}.checked_in_by"] = ['The checked_in_by may not be greater than 255 characters.'];
            }

            // checkin_method: required, string, in:qr_scan,manual,nfc
            if (! isset($record['checkin_method']) || ! is_string($record['checkin_method']) || $record['checkin_method'] === '') {
                $errors["records.{$index}.checkin_method"] = ['Each record must have a checkin_method.'];
            } elseif (! in_array($record['checkin_method'], self::VALID_CHECKIN_METHODS, true)) {
                $errors["records.{$index}.checkin_method"] = ['The checkin_method must be one of: qr_scan, manual, nfc.'];
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'event_id.required' => 'The event_id field is required.',
            'event_id.string'   => 'The event_id must be a string.',
            'batch_id.required' => 'The batch_id field is required.',
            'batch_id.uuid'     => 'The batch_id must be a valid UUID.',
            'records.required'  => 'The records array is required.',
            'records.array'     => 'The records field must be an array.',
            'records.min'       => 'The records array must contain at least one record.',
            'records.max'       => 'The records array may not contain more than 10,000 records.',
        ];
    }
}
