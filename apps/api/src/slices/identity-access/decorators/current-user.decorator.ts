import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@seat-reservation/contracts';

export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  roles: UserRole[];
  isRecoveryAdmin: boolean;
  buildingScopeId?: string;
  buildingScopeIds?: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUserPayload;
    return data ? user?.[data] : user;
  }
);

