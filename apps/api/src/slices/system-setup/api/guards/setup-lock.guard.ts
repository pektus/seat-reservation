import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException
} from '@nestjs/common';
import { SetupLockManager } from '../../infrastructure/setup-lock.manager.js';

@Injectable()
export class SetupLockGuard implements CanActivate {
  constructor(private readonly lockManager: SetupLockManager) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.lockManager.isLocked()) {
      throw new ForbiddenException(
        'System setup has already been completed and is permanently locked. For administrative actions, sign in with your credentials.'
      );
    }
    return true;
  }
}

