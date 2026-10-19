import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@seat-reservation/contracts';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { AuthPolicy } from '../domain/auth-policy.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    const userRoles: UserRole[] = user.roles || (user.role ? [user.role] : []);
    return AuthPolicy.hasRequiredRole(userRoles, requiredRoles);
  }
}

