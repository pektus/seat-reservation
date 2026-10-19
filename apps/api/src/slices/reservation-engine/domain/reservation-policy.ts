import { Result } from '../../../common/result.js';
import { UserRole } from '@seat-reservation/contracts';

export interface GuestDetailsInput {
  isGuest?: boolean;
  guestName?: string;
  guestEmail?: string;
}

export interface CancellationContext {
  reservedByUserId: string;
  requestingUserId: string;
  userRoles: UserRole[];
  isRecoveryAdmin?: boolean;
  buildingScopeId?: string;
  buildingScopeIds?: string[];
  targetBuildingId?: string;
}

export class ReservationPolicy {
  private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  public static validateReservationDate(dateStr: string): Result<void> {
    if (!dateStr || !this.DATE_REGEX.test(dateStr)) {
      return Result.fail('Invalid reservation date format. Expected YYYY-MM-DD');
    }

    const targetDate = new Date(`${dateStr}T00:00:00Z`);
    if (isNaN(targetDate.getTime())) {
      return Result.fail('Invalid date');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(`${todayStr}T00:00:00Z`);

    if (targetDate < today) {
      return Result.fail('Cannot reserve a desk for a date in the past');
    }

    return Result.ok();
  }

  public static validateGuestDetails(input: GuestDetailsInput): Result<void> {
    if (!input.isGuest) {
      return Result.ok();
    }

    if (!input.guestName || input.guestName.trim().length === 0) {
      return Result.fail('Guest name is required when booking for a guest');
    }

    if (input.guestName.trim().length > 150) {
      return Result.fail('Guest name cannot exceed 150 characters');
    }

    return Result.ok();
  }

  public static canCancelReservation(context: CancellationContext): boolean {
    if (context.isRecoveryAdmin) {
      return true;
    }

    if (context.requestingUserId === context.reservedByUserId) {
      return true;
    }

    if (context.userRoles?.includes(UserRole.SYSTEM_ADMIN)) {
      return true;
    }

    if (context.userRoles?.includes(UserRole.BUILDING_MANAGER)) {
      if (!context.targetBuildingId) {
        return false;
      }
      const allowedScopes = [
        ...(context.buildingScopeIds || []),
        ...(context.buildingScopeId ? [context.buildingScopeId] : [])
      ];
      return allowedScopes.includes(context.targetBuildingId);
    }

    return false;
  }
}

