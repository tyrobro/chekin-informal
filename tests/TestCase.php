<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Clean up after each test to release memory held by circular references.
     *
     * PHPUnit keeps the test instance alive across methods. Without explicit
     * GC, the Request/Response objects from a 10K-record test persist into
     * the next test method, doubling peak memory and causing OOM on the
     * second postJson() call.
     */
    protected function tearDown(): void
    {
        parent::tearDown();
        gc_collect_cycles();
    }

    /**
     * Send a JSON request without the expensive extractFilesFromDataArray() pass.
     *
     * The parent's json() recursively walks the $data array for SymfonyUploadedFile
     * instances, forcing a copy-on-write separation (~8 MB for 10K records) and
     * building a parallel empty-array structure that FileBag must process.
     *
     * JSON API requests never contain file uploads in the data array. Skipping
     * the extraction eliminates ~10 MB of transient heap and avoids the
     * FileBag::fixPhpFilesArray() recursion that triggers the OOM.
     *
     * @param  string  $method
     * @param  \Illuminate\Support\Uri|string  $uri
     * @param  array  $data
     * @param  array  $headers
     * @param  int  $options
     * @return \Illuminate\Testing\TestResponse
     */
    public function json($method, $uri, array $data = [], array $headers = [], $options = 0)
    {
        $content = json_encode($data, $options);
        unset($data);

        $headers = array_merge([
            'CONTENT_LENGTH' => mb_strlen($content, '8bit'),
            'CONTENT_TYPE' => 'application/json',
            'Accept' => 'application/json',
        ], $headers);

        return $this->call(
            $method,
            $uri,
            [],
            $this->prepareCookiesForJsonRequest(),
            [],
            $this->transformHeadersToServerVars($headers),
            $content
        );
    }
}
