import { ReservationPolicy } from './reservation-policy.js';
import { UserRole } from '@seat-reservation/contracts';

describe('ReservationPolicy (Domain Rules)', () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  it('should accept valid future date or today in YYYY-MM-DD format', () => {
    expect(ReservationPolicy.validateReservationDate(todayStr).isSuccess).toBe(true);
    expect(ReservationPolicy.validateReservationDate(tomorrowStr).isSuccess).toBe(true);
  });

  it('should reject past dates', () => {
    const result = ReservationPolicy.validateReservationDate(yesterdayStr);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Cannot reserve a desk for a date in the past');
  });

  it('should reject malformed date strings', () => {
    expect(ReservationPolicy.validateReservationDate('invalid-date').isFailure).toBe(true);
    expect(ReservationPolicy.validateReservationDate('2026/10/16').isFailure).toBe(true);
  });

  it('should accept valid personal self-reservation without guest details', () => {
    const result = ReservationPolicy.validateGuestDetails({
      isGuest: false
    });
    expect(result.isSuccess).toBe(true);
  });

  it('should require guest full name when isGuest is true', () => {
    const withoutName = ReservationPolicy.validateGuestDetails({
      isGuest: true,
      guestName: '   '
    });
    expect(withoutName.isFailure).toBe(true);
    expect(withoutName.getError()).toContain('Guest name is required when booking for a guest');

    const withName = ReservationPolicy.validateGuestDetails({
      isGuest: true,
      guestName: 'Alice Walker',
      guestEmail: 'alice@client.com'
    });
    expect(withName.isSuccess).toBe(true);
  });

  it('should authorize reservation owner to cancel', () => {
    const canCancel = ReservationPolicy.canCancelReservation({
      reservedByUserId: 'user-100',
      requestingUserId: 'user-100',
      userRoles: [UserRole.EMPLOYEE]
    });
    expect(canCancel).toBe(true);
  });

  it('should authorize SYSTEM_ADMIN to cancel any reservation globally', () => {
    const adminCanCancel = ReservationPolicy.canCancelReservation({
      reservedByUserId: 'user-100',
      requestingUserId: 'user-999',
      userRoles: [UserRole.SYSTEM_ADMIN],
      targetBuildingId: 'bldg-any'
    });
    expect(adminCanCancel).toBe(true);
  });

  it('should authorize BUILDING_MANAGER to cancel reservations within their assigned building scope(s)', () => {
    const scopedManagerAllowed = ReservationPolicy.canCancelReservation({
      reservedByUserId: 'user-100',
      requestingUserId: 'user-888',
      userRoles: [UserRole.BUILDING_MANAGER],
      buildingScopeIds: ['bldg-alpha', 'bldg-beta'],
      targetBuildingId: 'bldg-alpha'
    });
    expect(scopedManagerAllowed).toBe(true);
  });

  it('should deny BUILDING_MANAGER cancellation for reservations outside their assigned building scope', () => {
    const scopedManagerDenied = ReservationPolicy.canCancelReservation({
      reservedByUserId: 'user-100',
      requestingUserId: 'user-888',
      userRoles: [UserRole.BUILDING_MANAGER],
      buildingScopeIds: ['bldg-alpha'],
      targetBuildingId: 'bldg-gamma'
    });
    expect(scopedManagerDenied).toBe(false);

    const unscopedManagerDenied = ReservationPolicy.canCancelReservation({
      reservedByUserId: 'user-100',
      requestingUserId: 'user-888',
      userRoles: [UserRole.BUILDING_MANAGER]
    });
    expect(unscopedManagerDenied).toBe(false);
  });

  it('should deny cancellation by another employee who is not the owner', () => {
    const otherEmployeeCanCancel = ReservationPolicy.canCancelReservation({
      reservedByUserId: 'user-100',
      requestingUserId: 'user-200',
      userRoles: [UserRole.EMPLOYEE]
    });
    expect(otherEmployeeCanCancel).toBe(false);
  });
});

