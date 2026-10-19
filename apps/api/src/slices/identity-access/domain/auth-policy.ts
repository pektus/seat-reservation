import { Result } from '../../../common/result.js';
import { UserRole } from '@seat-reservation/contracts';

export interface UserAuthContext {
  isActive: boolean;
  hasRoles: boolean;
}

export class AuthPolicy {
  public static canUserAuthenticate(context: UserAuthContext): Result<void> {
    if (!context.isActive) {
      return Result.fail('Account is deactivated. Please contact your system administrator.');
    }

    if (!context.hasRoles) {
      return Result.fail('No authorized roles assigned to this account.');
    }

    return Result.ok();
  }

  public static hasRequiredRole(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
    if (requiredRoles.length === 0) {
      return true;
    }

    // SYSTEM_ADMIN possesses universal bypass authorization
    if (userRoles.includes(UserRole.SYSTEM_ADMIN)) {
      return true;
    }

    return requiredRoles.some((role) => userRoles.includes(role));
  }
}

