<?php

use App\Features\SyncBack\Http\Middleware\VerifySharedSecret;
use Illuminate\Console\Scheduling\Schedule;
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

        // Skip TrimStrings and ConvertEmptyStringsToNull for internal machine-to-machine
        // endpoints that receive large JSON batches (10,000+ records). These middleware
        // recursively clone the entire decoded JSON payload via cleanArray(), creating
        // a full copy of the ~8 MB records array per middleware pass. For a 10K-record
        // batch this adds ~16 MB of transient heap pressure that pushes past the
        // memory_limit. The sync-back endpoint receives pre-validated machine data
        // from Supabase that does not require string trimming or null conversion.
        $middleware->trimStrings(except: [
            fn ($request) => $request->is('api/internal/checkin/sync-back'),
        ]);
        $middleware->convertEmptyStringsToNull(except: [
            fn ($request) => $request->is('api/internal/checkin/sync-back'),
        ]);
    })
    ->withSchedule(function (Schedule $schedule): void {
        // C3: Run the post-event sync-back orchestrator every 5 minutes.
        // withoutOverlapping() ensures only one instance runs at a time.
        // Requirements: 1.1, 1.4
        $schedule->command('checkin:post-event-sync')
            ->everyFiveMinutes()
            ->withoutOverlapping();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
