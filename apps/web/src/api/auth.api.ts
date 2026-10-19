import { ApiClient } from './client.js';
import { UserRole, UserSummaryDto, UpdateUserRolesRequest } from '@seat-reservation/contracts';

export interface LoginRequest {
  email: string;
  password: string;
  isRecoveryLogin?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: {
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

export class AuthApi {
  public static login(request: LoginRequest): Promise<AuthResponse> {
    return ApiClient.post<AuthResponse>('/auth/login', request);
  }

  public static getProfile(): Promise<AuthResponse['user']> {
    return ApiClient.get<AuthResponse['user']>('/auth/me');
  }

  public static listUsers(): Promise<UserSummaryDto[]> {
    return ApiClient.get<UserSummaryDto[]>('/auth/users');
  }

  public static updateUserRoles(userId: string, request: UpdateUserRolesRequest): Promise<UserSummaryDto> {
    return ApiClient.put<UserSummaryDto>(`/auth/users/${userId}/roles`, request);
  }
}

