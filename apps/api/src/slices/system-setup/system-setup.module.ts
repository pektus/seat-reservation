import { Module } from '@nestjs/common';
import { SystemSetupController } from './api/system-setup.controller.js';
import { SystemSetupService } from './system-setup.service.js';
import { DatabaseService } from './infrastructure/database.service.js';
import { SetupLockManager } from './infrastructure/setup-lock.manager.js';
import { SetupLockGuard } from './api/guards/setup-lock.guard.js';

/**
 * SystemSetupModule - Slice 1
 * Handles initial system onboarding, DB connection verification,
 * recovery admin provisioning, and one-time setup locking.
 */
@Module({
  imports: [],
  controllers: [SystemSetupController],
  providers: [
    SystemSetupService,
    DatabaseService,
    SetupLockManager,
    SetupLockGuard
  ],
  exports: [DatabaseService, SetupLockManager]
})
export class SystemSetupModule {}
