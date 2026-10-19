import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import {
  UserRole,
  UserSummaryDto,
  UserRoleAssignmentDto,
  UpdateUserRolesRequest
} from '@seat-reservation/contracts';
import { DatabaseService } from '../system-setup/infrastructure/database.service.js';
import { LoginDto } from './api/dto/login.dto.js';
import { AuthResponseDto } from './api/dto/auth-response.dto.js';
import { AuthPolicy } from './domain/auth-policy.js';
import { AuthenticatedUserPayload } from './decorators/current-user.decorator.js';

@Injectable()
export class IdentityAccessService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService
  ) {}

  public async login(dto: LoginDto): Promise<AuthResponseDto> {
    const emailNormalized = dto.email.toLowerCase().trim();

    // 1. Fetch user by email
    const userResult = await this.databaseService.query(
      `SELECT id, email, full_name, password_hash, is_recovery_admin, is_active, token_version
       FROM users
       WHERE email = $1`,
      [emailNormalized]
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = userResult.rows[0];

    // 2. Validate recovery admin intent if specified
    if (dto.isRecoveryLogin && !user.is_recovery_admin) {
      throw new UnauthorizedException('Provided credentials do not have recovery administrator privileges');
    }

    // 3. Compare password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash || '');
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Fetch assigned roles and building scopes
    const rolesResult = await this.databaseService.query(
      `SELECT r.role_name, ur.building_scope_id
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const roles: UserRole[] = Array.from(new Set(rolesResult.rows.map((row: any) => row.role_name as UserRole)));
    const buildingScopeIds: string[] = rolesResult.rows
      .map((row: any) => row.building_scope_id)
      .filter((id: any) => Boolean(id));
    const buildingScopeId: string | undefined = buildingScopeIds[0] || undefined;

    // 5. Enforce domain policy
    const policyResult = AuthPolicy.canUserAuthenticate({
      isActive: user.is_active,
      hasRoles: roles.length > 0 || user.is_recovery_admin
    });

    if (policyResult.isFailure) {
      throw new UnauthorizedException(policyResult.getError());
    }

    // If recovery admin, ensure SYSTEM_ADMIN is included
    if (user.is_recovery_admin && !roles.includes(UserRole.SYSTEM_ADMIN)) {
      roles.push(UserRole.SYSTEM_ADMIN);
    }

    const primaryRole = roles[0] || UserRole.EMPLOYEE;

    // 6. Sign JWT
    const payload = {
      sub: user.id,
      email: user.email,
      fullName: user.full_name,
      role: primaryRole,
      roles,
      isRecoveryAdmin: user.is_recovery_admin,
      buildingScopeId,
      buildingScopeIds,
      tokenVersion: user.token_version || 1
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: primaryRole,
        roles,
        isRecoveryAdmin: user.is_recovery_admin,
        buildingScopeId,
        buildingScopeIds
      }
    };
  }

  public async getProfile(userId: string): Promise<AuthenticatedUserPayload> {
    const userResult = await this.databaseService.query(
      `SELECT id, email, full_name, is_recovery_admin, is_active
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const user = userResult.rows[0];

    const rolesResult = await this.databaseService.query(
      `SELECT r.role_name, ur.building_scope_id
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const roles: UserRole[] = Array.from(new Set(rolesResult.rows.map((row: any) => row.role_name as UserRole)));
    if (user.is_recovery_admin && !roles.includes(UserRole.SYSTEM_ADMIN)) {
      roles.push(UserRole.SYSTEM_ADMIN);
    }

    const buildingScopeIds: string[] = rolesResult.rows
      .map((row: any) => row.building_scope_id)
      .filter((id: any) => Boolean(id));

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: roles[0] || UserRole.EMPLOYEE,
      roles,
      isRecoveryAdmin: user.is_recovery_admin,
      buildingScopeId: buildingScopeIds[0],
      buildingScopeIds
    };
  }

  public async listUsers(): Promise<UserSummaryDto[]> {
    const usersRes = await this.databaseService.query(
      `SELECT u.id, u.email, u.full_name, u.auth_provider, u.is_active, u.is_recovery_admin, u.created_at
       FROM users u
       ORDER BY u.created_at ASC`
    );

    const rolesRes = await this.databaseService.query(
      `SELECT ur.user_id, r.role_name, ur.building_scope_id, b.name as building_name
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       LEFT JOIN buildings b ON ur.building_scope_id = b.id`
    );

    const rolesByUser = new Map<string, UserRoleAssignmentDto[]>();
    for (const row of rolesRes.rows) {
      if (!rolesByUser.has(row.user_id)) {
        rolesByUser.set(row.user_id, []);
      }
      rolesByUser.get(row.user_id)!.push({
        roleName: row.role_name as UserRole,
        buildingScopeId: row.building_scope_id || undefined,
        buildingName: row.building_name || undefined
      });
    }

    return usersRes.rows.map((u: any) => {
      const userRoles = rolesByUser.get(u.id) || [];
      if (u.is_recovery_admin && !userRoles.some(r => r.roleName === UserRole.SYSTEM_ADMIN)) {
        userRoles.unshift({ roleName: UserRole.SYSTEM_ADMIN });
      }
      return {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        authProvider: u.auth_provider,
        isActive: u.is_active,
        isRecoveryAdmin: u.is_recovery_admin,
        roles: userRoles,
        createdAt: u.created_at.toISOString()
      };
    });
  }

  public async updateUserRoles(
    userId: string,
    dto: UpdateUserRolesRequest,
    requestingAdmin: AuthenticatedUserPayload
  ): Promise<UserSummaryDto> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const userRes = await this.databaseService.query(
      `SELECT id, email, full_name, is_recovery_admin, is_active FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const targetUser = userRes.rows[0];

    // If target user is recovery admin, ensure SYSTEM_ADMIN is not removed
    if (targetUser.is_recovery_admin) {
      const hasSystemAdmin = dto.assignments?.some(a => a.roleName === UserRole.SYSTEM_ADMIN);
      if (!hasSystemAdmin) {
        throw new BadRequestException('Cannot remove SYSTEM_ADMIN role from break-glass recovery admin account');
      }
    }

    // Validate assignments array
    if (!Array.isArray(dto.assignments) || dto.assignments.length === 0) {
      throw new BadRequestException('User must have at least one role assigned');
    }

    // Validate building scopes exist
    for (const assignment of dto.assignments) {
      if (assignment.roleName === UserRole.BUILDING_MANAGER) {
        if (!assignment.buildingScopeId) {
          throw new BadRequestException('BUILDING_MANAGER role requires an assigned buildingScopeId');
        }
        if (!UUID_REGEX.test(assignment.buildingScopeId)) {
          throw new BadRequestException('Invalid buildingScopeId format');
        }
        const bldgRes = await this.databaseService.query(
          `SELECT id FROM buildings WHERE id = $1`,
          [assignment.buildingScopeId]
        );
        if (bldgRes.rows.length === 0) {
          throw new BadRequestException(`Building with ID '${assignment.buildingScopeId}' does not exist`);
        }
      }
    }

    // Role ID lookup
    const allRolesRes = await this.databaseService.query(`SELECT id, role_name FROM roles`);
    const roleIdMap = new Map<string, string>();
    for (const r of allRolesRes.rows) {
      roleIdMap.set(r.role_name, r.id);
    }

    const pool = this.databaseService.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear existing roles
      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);

      // Insert new assignments
      for (const item of dto.assignments) {
        const roleId = roleIdMap.get(item.roleName);
        if (!roleId) {
          throw new BadRequestException(`Role '${item.roleName}' is not defined`);
        }
        await client.query(
          `INSERT INTO user_roles (user_id, role_id, building_scope_id)
           VALUES ($1, $2, $3)
           ON CONFLICT ON CONSTRAINT uq_user_role_scope DO NOTHING`,
          [userId, roleId, item.buildingScopeId || null]
        );
      }

      // Invalidate existing active JWT tokens with obsolete roles/scopes
      await client.query(
        'UPDATE users SET token_version = token_version + 1 WHERE id = $1',
        [userId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const allUsers = await this.listUsers();
    return allUsers.find(u => u.id === userId)!;
  }
}

