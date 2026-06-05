<?php
declare(strict_types=1);

namespace App\Features\AttendeeSync\Services;

class QrTokenService
{
    /**
     * Compute a QR token for the given ticket.
     *
     * Algorithm: HMAC-SHA256(ticket_id, raw_key_bytes) → 64-char lowercase hex string
     *
     * @param string $ticketId  The ticket identifier (message to sign)
     * @param string $hmacKey   64-character lowercase hex string (32 raw bytes)
     * @return string           64-character lowercase hex string
     */
    public function sign(string $ticketId, string $hmacKey): string
    {
        // Convert hex key to raw bytes before passing to hash_hmac
        return hash_hmac('sha256', $ticketId, hex2bin($hmacKey));
    }
}
