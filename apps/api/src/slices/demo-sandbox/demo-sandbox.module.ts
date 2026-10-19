import { Module } from '@nestjs/common';
import { SystemSetupModule } from '../system-setup/system-setup.module.js';
import { IdentityAccessModule } from '../identity-access/identity-access.module.js';
import { DemoSandboxController } from './api/demo-sandbox.controller.js';
import { DemoSeederService } from './infrastructure/demo-seeder.service.js';

/**
 * DemoSandboxModule - Slice 6
 * Bundles pre-configured floor plan layout and sample desks,
 * providing endpoints to seed and reset demo evaluation environments.
 */
@Module({
  imports: [SystemSetupModule, IdentityAccessModule],
  controllers: [DemoSandboxController],
  providers: [DemoSeederService],
  exports: [DemoSeederService]
})
export class DemoSandboxModule {}
