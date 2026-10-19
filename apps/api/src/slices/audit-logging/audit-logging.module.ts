import { Module } from '@nestjs/common';
import { SystemSetupModule } from '../system-setup/system-setup.module.js';
import { AuditLoggingService } from './audit-logging.service.js';

/**
 * AuditLoggingModule - Slice 5
 * Listens asynchronously to domain events from other slices
 * and persists an immutable audit log trail in PostgreSQL.
 */
@Module({
  imports: [SystemSetupModule],
  providers: [AuditLoggingService],
  exports: [AuditLoggingService]
})
export class AuditLoggingModule {}
