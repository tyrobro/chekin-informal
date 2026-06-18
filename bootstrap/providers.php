<?php

use App\Providers\AppServiceProvider;
use App\Providers\AttendeeSyncServiceProvider;
use App\Providers\PostEventSyncServiceProvider;
use App\Providers\SyncBackServiceProvider;

return [
    AppServiceProvider::class,
    AttendeeSyncServiceProvider::class,
    SyncBackServiceProvider::class,
    PostEventSyncServiceProvider::class,
];
