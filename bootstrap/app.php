<?php

use App\Features\SyncBack\Http\Middleware\VerifySharedSecret;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // SyncBack: shared-secret Bearer token authentication for internal endpoints.
        // Requirements: 1.1, 1.2, 1.3, 1.4
        $middleware->alias([
            'verify.shared.secret' => VerifySharedSecret::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
