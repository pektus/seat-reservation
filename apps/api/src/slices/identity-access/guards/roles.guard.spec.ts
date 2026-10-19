import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '@seat-reservation/contracts';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user })
      })
    } as unknown as ExecutionContext;
  }

  it('should allow access if no roles are required on route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ role: UserRole.EMPLOYEE });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.EMPLOYEE]);
    const context = createMockContext({ role: UserRole.EMPLOYEE, roles: [UserRole.EMPLOYEE] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access to SYSTEM_ADMIN even if route specifies BUILDING_MANAGER', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.BUILDING_MANAGER]);
    const context = createMockContext({ role: UserRole.SYSTEM_ADMIN, roles: [UserRole.SYSTEM_ADMIN] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access if user does not have required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.BUILDING_MANAGER]);
    const context = createMockContext({ role: UserRole.EMPLOYEE, roles: [UserRole.EMPLOYEE] });

    expect(guard.canActivate(context)).toBe(false);
  });
});

