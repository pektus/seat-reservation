import { UserRole } from '@seat-reservation/contracts';

export class AuthResponseDto {
  accessToken!: string;
  user!: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    roles: UserRole[];
    isRecoveryAdmin: boolean;
    buildingScopeId?: string;
    buildingScopeIds?: string[];
  };
}

