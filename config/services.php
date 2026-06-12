<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Supabase
    |--------------------------------------------------------------------------
    |
    | Credentials for the Supabase project used as the check-in store.
    | The service-role key is used by SupabaseUpsertService for admin upserts.
    | SUPABASE_RETRY_DELAY controls the backoff multiplier (set to 0 in tests).
    |
    */
    'supabase' => [
        'url'              => env('SUPABASE_URL'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        'retry_delay'      => (int) env('SUPABASE_RETRY_DELAY', 1),
    ],

    /*
    |--------------------------------------------------------------------------
    | Check-In Sync-Back Shared Secret
    |--------------------------------------------------------------------------
    |
    | Shared secret used to authenticate inbound POST /internal/checkin/sync-back
    | requests from Supabase. Read at runtime via VerifySharedSecret middleware.
    |
    | Requirements: 1.1, 1.2, 1.4
    |
    */
    'checkin_sync_back' => [
        'secret' => env('CHECKIN_SYNC_BACK_SECRET'),
    ],

];
