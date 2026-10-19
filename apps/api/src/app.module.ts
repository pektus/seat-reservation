import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Autonomous Vertical Slices
import { SystemSetupModule } from './slices/system-setup/system-setup.module.js';
import { IdentityAccessModule } from './slices/identity-access/identity-access.module.js';
import { WorkplaceManagementModule } from './slices/workplace-management/workplace-management.module.js';
import { ReservationEngineModule } from './slices/reservation-engine/reservation-engine.module.js';
import { AuditLoggingModule } from './slices/audit-logging/audit-logging.module.js';
import { DemoSandboxModule } from './slices/demo-sandbox/demo-sandbox.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env']
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20
    }),
    // Vertical Slices
    SystemSetupModule,
    IdentityAccessModule,
    WorkplaceManagementModule,
    ReservationEngineModule,
    AuditLoggingModule,
    DemoSandboxModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}

