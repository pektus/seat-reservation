import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ReservationDto,
  ReservationStatus,
  FloorAvailabilityResponse,
  UserRole
} from '@seat-reservation/contracts';
import { DatabaseService } from '../system-setup/infrastructure/database.service.js';
import { ReservationPolicy } from './domain/reservation-policy.js';
import { ReservationCreatedEvent } from './domain/events/reservation-created.event.js';
import { ReservationCancelledEvent } from './domain/events/reservation-cancelled.event.js';
import { CreateReservationDto } from './api/dto/create-reservation.dto.js';
import { AuthenticatedUserPayload } from '../identity-access/decorators/current-user.decorator.js';

@Injectable()
export class ReservationEngineService {
  private readonly logger = new Logger(ReservationEngineService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  public async createReservation(
    user: AuthenticatedUserPayload,
    dto: CreateReservationDto
  ): Promise<ReservationDto> {
    // 1. Validate date invariants
    const dateValidation = ReservationPolicy.validateReservationDate(dto.reservationDate);
    if (dateValidation.isFailure) {
      throw new BadRequestException(dateValidation.getError());
    }

    // 2. Validate guest invariants
    const guestValidation = ReservationPolicy.validateGuestDetails({
      isGuest: dto.isGuest,
      guestName: dto.guestName,
      guestEmail: dto.guestEmail
    });
    if (guestValidation.isFailure) {
      throw new BadRequestException(guestValidation.getError());
    }

    // 3. Prevent duplicate personal reservations on same date for same user
    if (!dto.isGuest) {
      const existingPersonal = await this.databaseService.query(
        `SELECT id FROM reservations
         WHERE reserved_by_user_id = $1 
           AND reservation_date = $2 
           AND is_guest = FALSE 
           AND status = 'CONFIRMED'`,
        [user.id, dto.reservationDate]
      );

      if (existingPersonal.rows.length > 0) {
        throw new ConflictException(
          `You already have an active personal seat reservation on ${dto.reservationDate}. You may only hold one personal desk per day.`
        );
      }
    }

    // 4. Verify desk exists and is active
    const deskRes = await this.databaseService.query(
      `SELECT d.id, d.code, d.label, f.id as floor_id, f.name as floor_name, b.name as building_name
       FROM desks d
       JOIN floors f ON d.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       WHERE d.id = $1 AND d.is_active = TRUE`,
      [dto.deskId]
    );

    if (deskRes.rows.length === 0) {
      throw new NotFoundException('Desk not found or is currently inactive');
    }

    const deskInfo = deskRes.rows[0];

    // 5. Insert reservation with atomic unique index protection
    try {
      const insertRes = await this.databaseService.query(
        `INSERT INTO reservations 
           (desk_id, reserved_by_user_id, reservation_date, status, is_guest, guest_name, guest_email, notes)
         VALUES ($1, $2, $3, 'CONFIRMED', $4, $5, $6, $7)
         RETURNING id, desk_id, reserved_by_user_id, reservation_date, status, is_guest, guest_name, guest_email, created_at`,
        [
          dto.deskId,
          user.id,
          dto.reservationDate,
          Boolean(dto.isGuest),
          dto.isGuest ? dto.guestName?.trim() : null,
          dto.isGuest ? dto.guestEmail?.trim() : null,
          dto.notes?.trim() || null
        ]
      );

      const reservation = insertRes.rows[0];

      // 6. Emit domain event
      this.eventEmitter.emit(
        ReservationCreatedEvent.EVENT_NAME,
        new ReservationCreatedEvent(
          reservation.id,
          reservation.desk_id,
          reservation.reserved_by_user_id,
          dto.reservationDate,
          reservation.is_guest,
          reservation.guest_name,
          reservation.created_at.toISOString()
        )
      );

      return {
        id: reservation.id,
        deskId: reservation.desk_id,
        deskCode: deskInfo.code,
        deskLabel: deskInfo.label,
        floorId: deskInfo.floor_id,
        floorName: deskInfo.floor_name,
        buildingName: deskInfo.building_name,
        reservedByUserId: reservation.reserved_by_user_id,
        reservedByName: user.fullName,
        reservationDate: dto.reservationDate,
        status: ReservationStatus.CONFIRMED,
        isGuest: reservation.is_guest,
        guestName: reservation.guest_name || undefined,
        guestEmail: reservation.guest_email || undefined,
        createdAt: reservation.created_at.toISOString()
      };
    } catch (err: any) {
      if (err.code === '23505') {
        if (err.constraint === 'uq_one_personal_reservation_per_user_date') {
          throw new ConflictException(
            `You already have an active personal seat reservation on ${dto.reservationDate}. You may only hold one personal desk per day.`
          );
        }
        // Unique violation from uq_active_desk_reservation_per_date
        throw new ConflictException(
          `Desk '${deskInfo.code}' is already reserved by another user on ${dto.reservationDate}. Please select another desk.`
        );
      }
      this.logger.error('Failed to create reservation', err.stack);
      throw err;
    }
  }

  public async getFloorAvailability(
    floorId: string,
    date: string,
    userOrUserId?: AuthenticatedUserPayload | string,
    floorPlanId?: string
  ): Promise<FloorAvailabilityResponse> {
    const user: AuthenticatedUserPayload | undefined =
      typeof userOrUserId === 'object' && userOrUserId !== null
        ? userOrUserId
        : typeof userOrUserId === 'string'
        ? ({ id: userOrUserId, role: UserRole.EMPLOYEE, roles: [UserRole.EMPLOYEE] } as any)
        : undefined;

    const currentUserId = user?.id;
    const isAdmin = Boolean(user && (user.role === UserRole.SYSTEM_ADMIN || user.roles?.includes(UserRole.SYSTEM_ADMIN)));

    let isManagerForThisFloor = false;
    if (!isAdmin && user && (user.role === UserRole.BUILDING_MANAGER || user.roles?.includes(UserRole.BUILDING_MANAGER))) {
      if (user.buildingScopeIds && user.buildingScopeIds.length > 0) {
        const bldgRes = await this.databaseService.query(
          `SELECT building_id FROM floors WHERE id = $1`,
          [floorId]
        );
        if (bldgRes.rows.length > 0 && user.buildingScopeIds.includes(bldgRes.rows[0].building_id)) {
          isManagerForThisFloor = true;
        }
      }
    }

    const canViewAllIdentities = Boolean(isAdmin || isManagerForThisFloor);
    let targetPlanId = floorPlanId;
    if (!targetPlanId) {
      const planRes = await this.databaseService.query(
        `SELECT id FROM floor_plans WHERE floor_id = $1 AND is_active = TRUE LIMIT 1`,
        [floorId]
      );
      if (planRes.rows.length > 0) {
        targetPlanId = planRes.rows[0].id;
      }
    }

    if (!targetPlanId) {
      return {
        floorId,
        floorPlanId: undefined,
        date,
        totalDesks: 0,
        availableDesks: 0,
        reservedDesks: 0,
        desks: []
      };
    }

    const res = await this.databaseService.query(
      `SELECT 
         d.id as desk_id,
         d.floor_plan_id,
         d.code,
         d.label,
         d.desk_type,
         d.x_coordinate_pct,
         d.y_coordinate_pct,
         d.needs_position_review,
         r.id as reservation_id,
         r.reserved_by_user_id,
         r.is_guest,
         r.guest_name,
         u.full_name as reserved_by_name
       FROM desks d
       LEFT JOIN reservations r ON r.desk_id = d.id 
         AND r.reservation_date = $2 
         AND r.status = 'CONFIRMED'
       LEFT JOIN users u ON r.reserved_by_user_id = u.id
       WHERE d.floor_id = $1 AND d.floor_plan_id = $3 AND d.is_active = TRUE
       ORDER BY d.code ASC`,
      [floorId, date, targetPlanId]
    );

    let totalDesks = 0;
    let availableDesks = 0;
    let reservedDesks = 0;

    const desks = res.rows.map((row: any) => {
      totalDesks++;
      const isReserved = Boolean(row.reservation_id);
      if (isReserved) {
        reservedDesks++;
      } else {
        availableDesks++;
      }

      const isReservedByCurrentUser = isReserved && currentUserId === row.reserved_by_user_id && !row.is_guest;
      const isOwnGuestBooking = isReserved && currentUserId === row.reserved_by_user_id && row.is_guest;

      // Identity disclosure control (Decision 1A):
      // Only administrators, assigned building managers, or the reserving user can view the booked identity.
      let bookedFor: string | undefined = undefined;
      if (isReserved) {
        if (canViewAllIdentities || isReservedByCurrentUser || isOwnGuestBooking) {
          bookedFor = row.is_guest ? `Guest: ${row.guest_name}` : row.reserved_by_name;
        }
      }

      return {
        id: row.desk_id,
        floorPlanId: row.floor_plan_id,
        code: row.code,
        label: row.label,
        deskType: row.desk_type,
        xCoordinatePct: Number(row.x_coordinate_pct),
        yCoordinatePct: Number(row.y_coordinate_pct),
        isAvailable: !isReserved,
        isReservedByCurrentUser,
        needsPositionReview: row.needs_position_review,
        reservationId: row.reservation_id || undefined,
        bookedFor
      };
    });

    return {
      floorId,
      floorPlanId: targetPlanId,
      date,
      totalDesks,
      availableDesks,
      reservedDesks,
      desks
    };
  }

  public async getUserReservations(userId: string): Promise<ReservationDto[]> {
    const res = await this.databaseService.query(
      `SELECT 
         r.id,
         r.desk_id,
         d.code as desk_code,
         d.label as desk_label,
         f.id as floor_id,
         f.name as floor_name,
         b.name as building_name,
         r.reserved_by_user_id,
         u.full_name as reserved_by_name,
         r.reservation_date,
         r.status,
         r.is_guest,
         r.guest_name,
         r.guest_email,
         r.created_at,
         r.cancelled_at
       FROM reservations r
       JOIN desks d ON r.desk_id = d.id
       JOIN floors f ON d.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN users u ON r.reserved_by_user_id = u.id
       WHERE r.reserved_by_user_id = $1
       ORDER BY r.reservation_date DESC, r.created_at DESC`,
      [userId]
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      deskId: row.desk_id,
      deskCode: row.desk_code,
      deskLabel: row.desk_label,
      floorId: row.floor_id,
      floorName: row.floor_name,
      buildingName: row.building_name,
      reservedByUserId: row.reserved_by_user_id,
      reservedByName: row.reserved_by_name,
      reservationDate: row.reservation_date.toISOString().split('T')[0],
      status: row.status as ReservationStatus,
      isGuest: row.is_guest,
      guestName: row.guest_name || undefined,
      guestEmail: row.guest_email || undefined,
      createdAt: row.created_at.toISOString(),
      cancelledAt: row.cancelled_at?.toISOString()
    }));
  }

  public async cancelReservation(
    reservationId: string,
    requestingUser: AuthenticatedUserPayload
  ): Promise<ReservationDto> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(reservationId)) {
      throw new NotFoundException('Reservation not found');
    }

    const res = await this.databaseService.query(
      `SELECT 
         r.id,
         r.desk_id,
         d.code as desk_code,
         d.label as desk_label,
         f.id as floor_id,
         f.name as floor_name,
         b.id as building_id,
         b.name as building_name,
         r.reserved_by_user_id,
         u.full_name as reserved_by_name,
         r.reservation_date,
         r.status,
         r.is_guest,
         r.guest_name,
         r.guest_email,
         r.created_at
       FROM reservations r
       JOIN desks d ON r.desk_id = d.id
       JOIN floors f ON d.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN users u ON r.reserved_by_user_id = u.id
       WHERE r.id = $1`,
      [reservationId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Reservation not found');
    }

    const row = res.rows[0];

    if (row.status === 'CANCELLED') {
      throw new BadRequestException('Reservation is already cancelled');
    }

    // Check authorization
    const canCancel = ReservationPolicy.canCancelReservation({
      reservedByUserId: row.reserved_by_user_id,
      requestingUserId: requestingUser.id,
      userRoles: requestingUser.roles,
      isRecoveryAdmin: requestingUser.isRecoveryAdmin,
      buildingScopeId: requestingUser.buildingScopeId,
      buildingScopeIds: requestingUser.buildingScopeIds,
      targetBuildingId: row.building_id
    });

    if (!canCancel) {
      throw new ForbiddenException('You do not have permission to cancel this reservation');
    }

    const now = new Date().toISOString();
    await this.databaseService.query(
      `UPDATE reservations
       SET status = 'CANCELLED', cancelled_at = $1
       WHERE id = $2`,
      [now, reservationId]
    );

    // Emit event
    this.eventEmitter.emit(
      ReservationCancelledEvent.EVENT_NAME,
      new ReservationCancelledEvent(
        row.id,
        row.desk_id,
        requestingUser.id,
        row.reservation_date.toISOString().split('T')[0],
        now
      )
    );

    return {
      id: row.id,
      deskId: row.desk_id,
      deskCode: row.desk_code,
      deskLabel: row.desk_label,
      floorId: row.floor_id,
      floorName: row.floor_name,
      buildingName: row.building_name,
      reservedByUserId: row.reserved_by_user_id,
      reservedByName: row.reserved_by_name,
      reservationDate: row.reservation_date.toISOString().split('T')[0],
      status: ReservationStatus.CANCELLED,
      isGuest: row.is_guest,
      guestName: row.guest_name || undefined,
      guestEmail: row.guest_email || undefined,
      createdAt: row.created_at.toISOString(),
      cancelledAt: now
    };
  }

  public async cancelReservationByDesk(
    deskId: string,
    date: string,
    requestingUser: AuthenticatedUserPayload
  ): Promise<ReservationDto> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(deskId)) {
      throw new NotFoundException('Desk not found');
    }

    const res = await this.databaseService.query(
      `SELECT id FROM reservations 
       WHERE desk_id = $1 AND reservation_date = $2 AND status = 'CONFIRMED'
       LIMIT 1`,
      [deskId, date]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Active reservation not found for this desk and date');
    }

    return this.cancelReservation(res.rows[0].id, requestingUser);
  }
}

