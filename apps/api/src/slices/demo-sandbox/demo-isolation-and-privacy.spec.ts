import { DatabaseService } from '../system-setup/infrastructure/database.service.js';
import { DemoSeederService } from './infrastructure/demo-seeder.service.js';
import { WorkplaceManagementService } from '../workplace-management/workplace-management.service.js';
import { ReservationEngineService } from '../reservation-engine/reservation-engine.service.js';
import { IdentityAccessService } from '../identity-access/identity-access.service.js';
import { JwtStrategy } from '../identity-access/infrastructure/jwt.strategy.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@seat-reservation/contracts';
import { AuthenticatedUserPayload } from '../identity-access/decorators/current-user.decorator.js';

describe('Demo Isolation, Privacy & Access Hardening (Real PostgreSQL Integration Spec)', () => {
  let dbService: DatabaseService;
  let demoSeeder: DemoSeederService;
  let workplaceService: WorkplaceManagementService;
  let reservationService: ReservationEngineService;
  let identityService: IdentityAccessService;
  let jwtStrategy: JwtStrategy;

  // Real production-like test entity IDs
  let realCompanyId: string;
  let realUserId: string;
  let realBuildingId: string;
  let realFloorId: string;
  let realDeskId: string;
  let realReservationId: string;

  const realUserPayload: AuthenticatedUserPayload = {
    id: '',
    email: 'real.user@company.com',
    fullName: 'Real Corporate Employee',
    role: UserRole.EMPLOYEE,
    roles: [UserRole.EMPLOYEE],
    isRecoveryAdmin: false
  };

  const adminPayload: AuthenticatedUserPayload = {
    id: 'admin-integration-id',
    email: 'admin@system.local',
    fullName: 'System Administrator',
    role: UserRole.SYSTEM_ADMIN,
    roles: [UserRole.SYSTEM_ADMIN],
    isRecoveryAdmin: false
  };

  beforeAll(async () => {
    dbService = new DatabaseService();
    await dbService.runPendingMigrations();

    const eventEmitter = new EventEmitter2();
    demoSeeder = new DemoSeederService(dbService);
    workplaceService = new WorkplaceManagementService(dbService);
    reservationService = new ReservationEngineService(dbService, eventEmitter);

    const configService = new ConfigService({ JWT_SECRET: 'test-integration-secret' });
    const jwtService = new JwtService({ secret: 'test-integration-secret' });
    identityService = new IdentityAccessService(dbService, jwtService);
    jwtStrategy = new JwtStrategy(configService, dbService);

    const pool = dbService.getPool();

    // 1. Create a REAL organization that happens to collide in name with demo organization ("Acme Tech HQ")
    const compRes = await pool.query(
      `INSERT INTO companies (name, is_demo) VALUES ('Acme Tech HQ', FALSE) RETURNING id`
    );
    realCompanyId = compRes.rows[0].id;

    // 2. Create a real corporate user
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, token_version, is_demo)
       VALUES ('employee@acme.local', 'real_hash_123', 'Real Employee', 1, FALSE)
       RETURNING id`
    );
    realUserId = userRes.rows[0].id;
    realUserPayload.id = realUserId;

    // Assign EMPLOYEE role to real user
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE role_name = 'EMPLOYEE'`,
      [realUserId]
    );

    // 3. Create real building, floor, desk
    const bldgRes = await pool.query(
      `INSERT INTO buildings (company_id, name, address, timezone)
       VALUES ($1, 'Corporate HQ Tower', '100 Main St', 'America/New_York')
       RETURNING id`,
      [realCompanyId]
    );
    realBuildingId = bldgRes.rows[0].id;

    const flrRes = await pool.query(
      `INSERT INTO floors (building_id, floor_number, name)
       VALUES ($1, 2, 'Floor 2 Executive')
       RETURNING id`,
      [realBuildingId]
    );
    realFloorId = flrRes.rows[0].id;

    const planRes = await pool.query(
      `INSERT INTO floor_plans (floor_id, file_path, mime_type, version, is_active)
       VALUES ($1, '/real-floor-plan.png', 'image/png', 1, TRUE)
       RETURNING id`,
      [realFloorId]
    );
    const realPlanId = planRes.rows[0].id;

    const deskRes = await pool.query(
      `INSERT INTO desks (floor_id, floor_plan_id, code, label, desk_type, x_coordinate_pct, y_coordinate_pct, is_active)
       VALUES ($1, $2, 'R-01', 'Real Executive Desk 1', 'STANDARD', 30.0, 30.0, TRUE)
       RETURNING id`,
      [realFloorId, realPlanId]
    );
    realDeskId = deskRes.rows[0].id;

    // 4. Create a confirmed live reservation for this real user
    const bookingRes = await pool.query(
      `INSERT INTO reservations (desk_id, reserved_by_user_id, reservation_date, status, is_guest, is_demo)
       VALUES ($1, $2, '2026-11-30', 'CONFIRMED', FALSE, FALSE)
       RETURNING id`,
      [realDeskId, realUserId]
    );
    realReservationId = bookingRes.rows[0].id;
  });

  afterAll(async () => {
    try {
      const pool = dbService.getPool();
      // Purge any demo data created during test
      await workplaceService.purgeDemoData();

      // Clean up real test records
      if (realCompanyId) {
        await pool.query(`DELETE FROM companies WHERE id = $1`, [realCompanyId]);
      }
      if (realUserId) {
        await pool.query(`DELETE FROM users WHERE id = $1`, [realUserId]);
      }
      await dbService.onModuleDestroy();
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Priority 0: Demo Isolation & Data Safety', () => {
    it('seeds demo workplace strictly with is_demo = TRUE without interfering with real company of same name', async () => {
      const seedRes = await demoSeeder.seedDemoData();
      expect(seedRes.success).toBe(true);

      const pool = dbService.getPool();
      const demoCompRes = await pool.query(
        `SELECT id, name, is_demo FROM companies WHERE is_demo = TRUE`
      );
      expect(demoCompRes.rows.length).toBeGreaterThan(0);
      expect(demoCompRes.rows[0].id).not.toBe(realCompanyId);

      // Verify real company is still intact and is_demo = FALSE
      const realCompCheck = await pool.query(
        `SELECT id, name, is_demo FROM companies WHERE id = $1`,
        [realCompanyId]
      );
      expect(realCompCheck.rows).toHaveLength(1);
      expect(realCompCheck.rows[0].is_demo).toBe(false);
    });

    it('resetDemoData cancels user bookings on demo desks while preserving real organization and reservations', async () => {
      const pool = dbService.getPool();

      // Find a demo desk
      const demoDeskRes = await pool.query(
        `SELECT d.id FROM desks d
         JOIN floors f ON d.floor_id = f.id
         JOIN buildings b ON f.building_id = b.id
         JOIN companies c ON b.company_id = c.id
         WHERE c.is_demo = TRUE LIMIT 1`
      );
      const demoDeskId = demoDeskRes.rows[0].id;

      // User creates a booking on a demo desk with is_demo = FALSE
      const userBooking = await reservationService.createReservation(realUserPayload, {
        deskId: demoDeskId,
        reservationDate: '2026-12-15',
        isGuest: false
      });
      expect(userBooking.status).toBe('CONFIRMED');

      // Now invoke resetDemoData
      const resetRes = await demoSeeder.resetDemoData();
      expect(resetRes.success).toBe(true);

      // 1. Verify user's booking on the demo desk was CANCELLED
      const userBookingCheck = await pool.query(
        `SELECT status FROM reservations WHERE id = $1`,
        [userBooking.id]
      );
      expect(userBookingCheck.rows[0].status).toBe('CANCELLED');

      // 2. Verify REAL company's reservation is STILL CONFIRMED
      const realBookingCheck = await pool.query(
        `SELECT status, is_demo FROM reservations WHERE id = $1`,
        [realReservationId]
      );
      expect(realBookingCheck.rows[0].status).toBe('CONFIRMED');
      expect(realBookingCheck.rows[0].is_demo).toBe(false);

      // 3. Verify REAL company was not touched
      const realCompCheck = await pool.query(
        `SELECT id, name, is_demo FROM companies WHERE id = $1`,
        [realCompanyId]
      );
      expect(realCompCheck.rows).toHaveLength(1);
    });

    it('purgeDemoData strictly deletes only is_demo = TRUE records and leaves real organizations unharmed', async () => {
      const purgeRes = await workplaceService.purgeDemoData();
      expect(purgeRes.clearedCount).toBeGreaterThan(0);

      const pool = dbService.getPool();

      // Real company must still exist
      const realCompCheck = await pool.query(
        `SELECT id, name, is_demo FROM companies WHERE id = $1`,
        [realCompanyId]
      );
      expect(realCompCheck.rows).toHaveLength(1);

      // Real user and their reservation must still exist
      const realBookingCheck = await pool.query(
        `SELECT status FROM reservations WHERE id = $1`,
        [realReservationId]
      );
      expect(realBookingCheck.rows).toHaveLength(1);
      expect(realBookingCheck.rows[0].status).toBe('CONFIRMED');

      // All is_demo companies are gone
      const demoCheck = await pool.query(
        `SELECT COUNT(*) FROM companies WHERE is_demo = TRUE`
      );
      expect(parseInt(demoCheck.rows[0].count, 10)).toBe(0);
    });
  });

  describe('Priority 1: Floor Availability Identity Privacy', () => {
    it('hides bookedFor identity from other employees while showing status = RESERVED', async () => {
      const otherEmployeePayload: AuthenticatedUserPayload = {
        id: 'other-emp-id-456',
        email: 'other@company.com',
        fullName: 'Other Colleague',
        role: UserRole.EMPLOYEE,
        roles: [UserRole.EMPLOYEE],
        isRecoveryAdmin: false
      };

      const availability = await reservationService.getFloorAvailability(
        realFloorId,
        '2026-11-30',
        otherEmployeePayload
      );

      const desk = availability.desks.find(d => d.id === realDeskId);
      expect(desk).toBeDefined();
      expect(desk!.isAvailable).toBe(false);
      expect(desk!.isReservedByCurrentUser).toBe(false);
      // Privacy expectation: bookedFor is omitted for unrelated employees
      expect(desk!.bookedFor).toBeUndefined();
    });

    it('reveals bookedFor identity to the reserving user themselves', async () => {
      const availability = await reservationService.getFloorAvailability(
        realFloorId,
        '2026-11-30',
        realUserPayload
      );

      const desk = availability.desks.find(d => d.id === realDeskId);
      expect(desk).toBeDefined();
      expect(desk!.isAvailable).toBe(false);
      expect(desk!.isReservedByCurrentUser).toBe(true);
      expect(desk!.bookedFor).toBe('Real Employee');
    });

    it('reveals bookedFor identity to SYSTEM_ADMIN', async () => {
      const availability = await reservationService.getFloorAvailability(
        realFloorId,
        '2026-11-30',
        adminPayload
      );

      const desk = availability.desks.find(d => d.id === realDeskId);
      expect(desk).toBeDefined();
      expect(desk!.isAvailable).toBe(false);
      expect(desk!.bookedFor).toBe('Real Employee');
    });

    it('reveals bookedFor identity to BUILDING_MANAGER assigned to that building', async () => {
      const managerPayload: AuthenticatedUserPayload = {
        id: 'assigned-mgr-id',
        email: 'mgr@tower.com',
        fullName: 'Tower Manager',
        role: UserRole.BUILDING_MANAGER,
        roles: [UserRole.BUILDING_MANAGER],
        buildingScopeIds: [realBuildingId],
        isRecoveryAdmin: false
      };

      const availability = await reservationService.getFloorAvailability(
        realFloorId,
        '2026-11-30',
        managerPayload
      );

      const desk = availability.desks.find(d => d.id === realDeskId);
      expect(desk).toBeDefined();
      expect(desk!.bookedFor).toBe('Real Employee');
    });

    it('hides bookedFor identity from BUILDING_MANAGER when building is out of assigned scope', async () => {
      const outOfScopeManager: AuthenticatedUserPayload = {
        id: 'other-mgr-id',
        email: 'other.mgr@remote.com',
        fullName: 'Remote Manager',
        role: UserRole.BUILDING_MANAGER,
        roles: [UserRole.BUILDING_MANAGER],
        buildingScopeIds: ['00000000-0000-0000-0000-000000000099'],
        isRecoveryAdmin: false
      };

      const availability = await reservationService.getFloorAvailability(
        realFloorId,
        '2026-11-30',
        outOfScopeManager
      );

      const desk = availability.desks.find(d => d.id === realDeskId);
      expect(desk).toBeDefined();
      expect(desk!.bookedFor).toBeUndefined();
    });
  });

  describe('Priority 1: Scoped Workplace Reads for BUILDING_MANAGER', () => {
    it('denies listFloors to BUILDING_MANAGER when building is out of scope', async () => {
      const scopedManager: AuthenticatedUserPayload = {
        id: 'mgr-scope-id',
        email: 'mgr@test.local',
        fullName: 'Scope Manager',
        role: UserRole.BUILDING_MANAGER,
        roles: [UserRole.BUILDING_MANAGER],
        buildingScopeIds: ['11111111-1111-1111-1111-111111111111'],
        isRecoveryAdmin: false
      };

      await expect(
        workplaceService.listFloors(realBuildingId, scopedManager)
      ).rejects.toThrow(ForbiddenException);
    });

    it('filters listBuildings to assigned building scopes for BUILDING_MANAGER', async () => {
      const scopedManager: AuthenticatedUserPayload = {
        id: 'mgr-scope-id-2',
        email: 'mgr2@test.local',
        fullName: 'Scope Manager 2',
        role: UserRole.BUILDING_MANAGER,
        roles: [UserRole.BUILDING_MANAGER],
        buildingScopeIds: [realBuildingId],
        isRecoveryAdmin: false
      };

      const bldgs = await workplaceService.listBuildings(scopedManager);
      expect(bldgs.every(b => b.id === realBuildingId)).toBe(true);
    });
  });

  describe('Priority 2: Token Version Invalidation on Role Changes', () => {
    it('increments token_version when roles are updated and rejects stale JWT tokens', async () => {
      const pool = dbService.getPool();

      // Initial token_version is 1
      const initialUser = await pool.query(
        `SELECT token_version FROM users WHERE id = $1`,
        [realUserId]
      );
      const initialVersion = initialUser.rows[0].token_version;

      // Validate JWT with matching tokenVersion = 1 succeeds
      const validPayload = await jwtStrategy.validate({
        sub: realUserId,
        email: 'employee@acme.local',
        fullName: 'Real Employee',
        role: UserRole.EMPLOYEE,
        roles: [UserRole.EMPLOYEE],
        isRecoveryAdmin: false,
        tokenVersion: initialVersion
      });
      expect(validPayload.id).toBe(realUserId);

      // Now update user roles via identityService
      await identityService.updateUserRoles(
        realUserId,
        {
          assignments: [
            {
              roleName: UserRole.BUILDING_MANAGER,
              buildingScopeId: realBuildingId
            }
          ]
        },
        adminPayload
      );

      // Verify token_version was incremented in the database
      const updatedUser = await pool.query(
        `SELECT token_version FROM users WHERE id = $1`,
        [realUserId]
      );
      expect(updatedUser.rows[0].token_version).toBe(initialVersion + 1);

      // Validate old JWT with tokenVersion = initialVersion must now throw UnauthorizedException
      await expect(
        jwtStrategy.validate({
          sub: realUserId,
          email: 'employee@acme.local',
          fullName: 'Real Employee',
          role: UserRole.EMPLOYEE,
          roles: [UserRole.EMPLOYEE],
          isRecoveryAdmin: false,
          tokenVersion: initialVersion
        })
      ).rejects.toThrow(UnauthorizedException);

      // Validate new JWT with tokenVersion = initialVersion + 1 succeeds
      const newPayload = await jwtStrategy.validate({
        sub: realUserId,
        email: 'employee@acme.local',
        fullName: 'Real Employee',
        role: UserRole.BUILDING_MANAGER,
        roles: [UserRole.BUILDING_MANAGER],
        isRecoveryAdmin: false,
        tokenVersion: initialVersion + 1
      });
      expect(newPayload.id).toBe(realUserId);
    });
  });

  describe('Priority 4: Upload Security Validation', () => {
    it('rejects SVG floor plan uploads containing script tags or event handlers', async () => {
      // Script tag injection
      const maliciousSvg1 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect width="100" height="100"/></svg>`;
      await expect(
        workplaceService.uploadOrReplaceFloorPlan(
          realFloorId,
          { filePath: maliciousSvg1, mimeType: 'image/svg+xml' },
          adminPayload
        )
      ).rejects.toThrow(BadRequestException);

      // Event handler injection
      const maliciousSvg2 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" onload="fetch('/steal')"><circle r="50"/></svg>`;
      await expect(
        workplaceService.uploadOrReplaceFloorPlan(
          realFloorId,
          { filePath: maliciousSvg2, mimeType: 'image/svg+xml' },
          adminPayload
        )
      ).rejects.toThrow(BadRequestException);

      // foreignObject injection
      const maliciousSvg3 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="javascript:alert(1)"/></foreignObject></svg>`;
      await expect(
        workplaceService.uploadOrReplaceFloorPlan(
          realFloorId,
          { filePath: maliciousSvg3, mimeType: 'image/svg+xml' },
          adminPayload
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts clean sanitized SVG floor plan uploads', async () => {
      const cleanSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect x="0" y="0" width="800" height="600" fill="%23f0f0f0"/><text x="400" y="300" text-anchor="middle">Corporate Floor 2</text></svg>`;

      const plan = await workplaceService.uploadOrReplaceFloorPlan(
        realFloorId,
        { filePath: cleanSvg, mimeType: 'image/svg+xml' },
        adminPayload
      );

      expect(plan.id).toBeDefined();
      expect(plan.mimeType).toBe('image/svg+xml');
      expect(plan.isActive).toBe(true);
    });
  });
});
