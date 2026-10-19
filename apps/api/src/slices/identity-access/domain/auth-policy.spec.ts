import { AuthPolicy } from './auth-policy.js';
import { UserRole } from '@seat-reservation/contracts';

describe('AuthPolicy (Domain Rules)', () => {
  it('should allow active user to sign in', () => {
    const result = AuthPolicy.canUserAuthenticate({
      isActive: true,
      hasRoles: true
    });
    expect(result.isSuccess).toBe(true);
  });

  it('should reject inactive/disabled user account', () => {
    const result = AuthPolicy.canUserAuthenticate({
      isActive: false,
      hasRoles: true
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Account is deactivated');
  });

  it('should reject user with no assigned roles', () => {
    const result = AuthPolicy.canUserAuthenticate({
      isActive: true,
      hasRoles: false
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('No authorized roles assigned');
  });

  it('should grant SYSTEM_ADMIN universal authorization for any role requirement', () => {
    const isAuthorized = AuthPolicy.hasRequiredRole(
      [UserRole.SYSTEM_ADMIN],
      [UserRole.EMPLOYEE, UserRole.BUILDING_MANAGER]
    );
    expect(isAuthorized).toBe(true);
  });

  it('should verify exact role match for non-admin roles', () => {
    const employeeAllowed = AuthPolicy.hasRequiredRole(
      [UserRole.EMPLOYEE],
      [UserRole.EMPLOYEE]
    );
    expect(employeeAllowed).toBe(true);

    const employeeDeniedForManager = AuthPolicy.hasRequiredRole(
      [UserRole.EMPLOYEE],
      [UserRole.BUILDING_MANAGER]
    );
    expect(employeeDeniedForManager).toBe(false);
  });
});

