import { Module } from '@nestjs/common';
import { SystemSetupModule } from '../system-setup/system-setup.module.js';
import { IdentityAccessModule } from '../identity-access/identity-access.module.js';
import { ReservationController } from './api/reservation.controller.js';
import { ReservationEngineService } from './reservation-engine.service.js';

/**
 * ReservationEngineModule - Slice 4
 * Handles whole-day seat reservations, concurrency conflict detection,
 * self-bookings, and employee proxy bookings for external guests.
 */
@Module({
  imports: [
    SystemSetupModule,
    IdentityAccessModule
  ],
  controllers: [ReservationController],
  providers: [ReservationEngineService],
  exports: [ReservationEngineService]
})
export class ReservationEngineModule {}
