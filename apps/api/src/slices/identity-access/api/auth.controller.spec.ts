import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { IdentityAccessService } from '../identity-access.service.js';
import { UserRole } from '@seat-reservation/contracts';
import { AuthenticatedUserPayload } from '../decorators/current-user.decorator.js';

describe('AuthController (Integration Spec)', () => {
  let controller: AuthController;
  let authService: Partial<IdentityAccessService>;

  beforeEach(async () => {
    authService = {
      login: jest.fn().mockImplementation((dto) => {
        if (dto.password === 'wrong-password') {
          throw new UnauthorizedException('Invalid email or password');
        }
        return Promise.resolve({
          accessToken: 'mock-jwt-token-abc',
          user: {
            id: 'user-123',
            email: dto.email,
            fullName: 'Jane Doe',
            role: UserRole.EMPLOYEE,
            roles: [UserRole.EMPLOYEE],
            isRecoveryAdmin: false
          }
        });
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: IdentityAccessService, useValue: authService }
      ]
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should authenticate user with valid credentials and return access token', async () => {
    const res = await controller.login({
      email: 'jane@company.com',
      password: 'CorrectPassword123!'
    });

    expect(res.accessToken).toBe('mock-jwt-token-abc');
    expect(res.user.email).toBe('jane@company.com');
    expect(authService.login).toHaveBeenCalled();
  });

  it('should reject invalid credentials with UnauthorizedException', async () => {
    await expect(
      controller.login({
        email: 'jane@company.com',
        password: 'wrong-password'
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should return current user profile from @CurrentUser decorator', async () => {
    const mockUser: AuthenticatedUserPayload = {
      id: 'user-123',
      email: 'jane@company.com',
      fullName: 'Jane Doe',
      role: UserRole.EMPLOYEE,
      roles: [UserRole.EMPLOYEE],
      isRecoveryAdmin: false
    };

    const res = await controller.getProfile(mockUser);
    expect(res).toEqual(mockUser);
  });

  it('should list all users for system admin', async () => {
    const mockUsers = [
      {
        id: 'u-1',
        email: 'admin@acme.com',
        fullName: 'Admin User',
        authProvider: 'LOCAL',
        isActive: true,
        isRecoveryAdmin: true,
        roles: [{ roleName: UserRole.SYSTEM_ADMIN }],
        createdAt: '2026-10-16T00:00:00.000Z'
      }
    ];
    authService.listUsers = jest.fn().mockResolvedValue(mockUsers);

    const result = await controller.listUsers();
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('admin@acme.com');
    expect(authService.listUsers).toHaveBeenCalled();
  });

  it('should update user roles and building scopes', async () => {
    const updatedUser = {
      id: 'u-2',
      email: 'mgr@acme.com',
      fullName: 'Manager User',
      authProvider: 'LOCAL',
      isActive: true,
      isRecoveryAdmin: false,
      roles: [{ roleName: UserRole.BUILDING_MANAGER, buildingScopeId: 'bldg-1' }],
      createdAt: '2026-10-16T00:00:00.000Z'
    };
    authService.updateUserRoles = jest.fn().mockResolvedValue(updatedUser);

    const adminUser: AuthenticatedUserPayload = {
      id: 'admin-1',
      email: 'admin@acme.com',
      fullName: 'Admin',
      role: UserRole.SYSTEM_ADMIN,
      roles: [UserRole.SYSTEM_ADMIN],
      isRecoveryAdmin: true
    };

    const result = await controller.updateUserRoles(
      'u-2',
      { assignments: [{ roleName: UserRole.BUILDING_MANAGER, buildingScopeId: 'bldg-1' }] },
      adminUser
    );

    expect(result.roles[0].roleName).toBe(UserRole.BUILDING_MANAGER);
    expect(authService.updateUserRoles).toHaveBeenCalledWith(
      'u-2',
      { assignments: [{ roleName: UserRole.BUILDING_MANAGER, buildingScopeId: 'bldg-1' }] },
      adminUser
    );
  });
});

