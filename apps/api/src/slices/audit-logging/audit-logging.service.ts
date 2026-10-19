import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DatabaseService } from '../system-setup/infrastructure/database.service.js';
import { ReservationCreatedEvent } from '../reservation-engine/domain/events/reservation-created.event.js';
import { ReservationCancelledEvent } from '../reservation-engine/domain/events/reservation-cancelled.event.js';

@Injectable()
export class AuditLoggingService {
  private readonly logger = new Logger(AuditLoggingService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @OnEvent(ReservationCreatedEvent.EVENT_NAME, { async: true })
  async handleReservationCreated(event: ReservationCreatedEvent) {
    try {
      await this.databaseService.query(
        `INSERT INTO audit_logs (actor_user_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, 'RESERVATION', $3, $4)`,
        [
          event.reservedByUserId,
          'RESERVATION_CREATED',
          event.reservationId,
          JSON.stringify({
            deskId: event.deskId,
            date: event.reservationDate,
            isGuest: event.isGuest,
            guestName: event.guestName,
            timestamp: event.createdAt
          })
        ]
      );
      this.logger.log(`Audit log written: RESERVATION_CREATED for ${event.reservationId}`);
    } catch (err) {
      this.logger.error(`Failed to record audit log: ${(err as Error).message}`);
    }
  }

  @OnEvent(ReservationCancelledEvent.EVENT_NAME, { async: true })
  async handleReservationCancelled(event: ReservationCancelledEvent) {
    try {
      await this.databaseService.query(
        `INSERT INTO audit_logs (actor_user_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, 'RESERVATION', $3, $4)`,
        [
          event.cancelledByUserId,
          'RESERVATION_CANCELLED',
          event.reservationId,
          JSON.stringify({
            deskId: event.deskId,
            date: event.reservationDate,
            timestamp: event.cancelledAt
          })
        ]
      );
      this.logger.log(`Audit log written: RESERVATION_CANCELLED for ${event.reservationId}`);
    } catch (err) {
      this.logger.error(`Failed to record audit log: ${(err as Error).message}`);
    }
  }
}

