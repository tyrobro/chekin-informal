<?php

use App\Providers\AppServiceProvider;
use App\Providers\AttendeeSyncServiceProvider;
use App\Providers\SyncBackServiceProvider;

return [
    AppServiceProvider::class,
    AttendeeSyncServiceProvider::class,
    SyncBackServiceProvider::class,
];
