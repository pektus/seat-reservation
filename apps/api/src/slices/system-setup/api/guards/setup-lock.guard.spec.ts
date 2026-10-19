import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SetupLockGuard } from './setup-lock.guard.js';
import { SetupLockManager } from '../../infrastructure/setup-lock.manager.js';

describe('SetupLockGuard', () => {
  let guard: SetupLockGuard;
  let lockManager: Partial<SetupLockManager>;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockContext = {} as ExecutionContext;
  });

  it('should allow access when system setup is NOT locked', () => {
    lockManager = {
      isLocked: jest.fn().mockReturnValue(false)
    };
    guard = new SetupLockGuard(lockManager as SetupLockManager);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should throw ForbiddenException when system setup is already locked', () => {
    lockManager = {
      isLocked: jest.fn().mockReturnValue(true)
    };
    guard = new SetupLockGuard(lockManager as SetupLockManager);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });
});

