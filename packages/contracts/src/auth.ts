import { UserRole } from './enums.js';

export interface UserRoleAssignmentDto {
  roleName: UserRole;
  buildingScopeId?: string;
  buildingName?: string;
}

export interface UserSummaryDto {
  id: string;
  email: string;
  fullName: string;
  authProvider: string;
  isActive: boolean;
  isRecoveryAdmin: boolean;
  roles: UserRoleAssignmentDto[];
  createdAt: string;
}

export interface UpdateUserRoleItem {
  roleName: UserRole;
  buildingScopeId?: string;
}

export interface UpdateUserRolesRequest {
  assignments: UpdateUserRoleItem[];
}

