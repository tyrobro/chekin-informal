<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Sync-Back Chunk Size
    |--------------------------------------------------------------------------
    |
    | Number of CheckinRecords processed per database round-trip during a
    | sync-back operation. Tune this value to balance memory consumption
    | against query overhead for large batches (up to 10,000 records).
    |
    | Default: 500 records per chunk → 20 chunks for a 10K batch.
    |
    | Requirements: 7.2
    |
    */
    'chunk_size' => (int) env('SYNCBACK_CHUNK_SIZE', 500),

];
