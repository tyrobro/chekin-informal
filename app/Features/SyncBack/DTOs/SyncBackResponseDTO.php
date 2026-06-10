<?php

declare(strict_types=1);

namespace App\Features\SyncBack\DTOs;

/**
 * Carries the sync-back response payload.
 *
 * The key invariant — succeeded + failed === total — is enforced in toArray()
 * via an assertion. This ensures the response is always internally consistent
 * regardless of service-layer processing order.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6
 * Correctness Property 1: Response Count Invariant
 */
class SyncBackResponseDTO
{
    private int $succeeded = 0;
    private int $failed    = 0;
    /** @var FailureRecordDTO[] */
    private array $failures = [];

    public function __construct(
        private readonly string $batch_id,
        private readonly int    $total,
    ) {}

    /**
     * Increment the succeeded counter by one.
     * Call once per record that was successfully applied or skipped as a duplicate.
     *
     * Requirements: 4.3 (duplicates count as succeeded), 3.1 (valid updates)
     */
    public function recordSuccess(): void
    {
        $this->succeeded++;
    }

    /**
     * Increment the failed counter by one and append a FailureRecord.
     * Call once per record whose ticket_id was not found in the tickets table.
     *
     * Requirements: 5.3
     */
    public function recordFailure(string $ticketId, string $reason): void
    {
        $this->failed++;
        $this->failures[] = new FailureRecordDTO($ticketId, $reason);
    }

    /**
     * Serialise to the API response shape.
     *
     * Asserts the count invariant before serialising to catch any accounting
     * bugs during development/testing. In production the assertion is compiled
     * away when assertions are disabled via php.ini.
     *
     * @return array{batch_id: string, succeeded: int, failed: int, total: int, failures: list<array{ticket_id: string, reason: string}>}
     */
    public function toArray(): array
    {
        assert(
            $this->succeeded + $this->failed === $this->total,
            sprintf(
                'Response count invariant violated: succeeded(%d) + failed(%d) !== total(%d)',
                $this->succeeded,
                $this->failed,
                $this->total,
            )
        );

        return [
            'batch_id'  => $this->batch_id,
            'succeeded' => $this->succeeded,
            'failed'    => $this->failed,
            'total'     => $this->total,
            'failures'  => array_map(
                static fn (FailureRecordDTO $f): array => $f->toArray(),
                $this->failures
            ),
        ];
    }

    // -------------------------------------------------------------------------
    // Read-only accessors (used in tests and logging without triggering assert)
    // -------------------------------------------------------------------------

    public function getSucceeded(): int
    {
        return $this->succeeded;
    }

    public function getFailed(): int
    {
        return $this->failed;
    }

    public function getTotal(): int
    {
        return $this->total;
    }

    public function getBatchId(): string
    {
        return $this->batch_id;
    }

    /** @return FailureRecordDTO[] */
    public function getFailures(): array
    {
        return $this->failures;
    }
}
