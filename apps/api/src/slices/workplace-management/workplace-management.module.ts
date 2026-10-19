import { Module } from '@nestjs/common';
import { SystemSetupModule } from '../system-setup/system-setup.module.js';
import { IdentityAccessModule } from '../identity-access/identity-access.module.js';
import { WorkplaceController } from './api/workplace.controller.js';
import { WorkplaceManagementService } from './workplace-management.service.js';

/**
 * WorkplaceManagementModule - Slice 3
 * Handles Companies, Buildings, Floors, Floor Plan uploads (PNG/JPG/SVG),
 * click-to-place desk coordinates, and plan replacement review flags.
 */
@Module({
  imports: [
    SystemSetupModule,
    IdentityAccessModule
  ],
  controllers: [WorkplaceController],
  providers: [WorkplaceManagementService],
  exports: [WorkplaceManagementService]
})
export class WorkplaceManagementModule {}
