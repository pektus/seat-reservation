import { DatabaseService } from '../system-setup/infrastructure/database.service.js';
import { ReservationEngineService } from './reservation-engine.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException } from '@nestjs/common';
import { UserRole } from '@seat-reservation/contracts';
import { AuthenticatedUserPayload } from '../identity-access/decorators/current-user.decorator.js';

describe('ReservationEngineService Concurrency (Real PostgreSQL Spec)', () => {
  let dbService: DatabaseService;
  let reservationService: ReservationEngineService;
  let eventEmitter: EventEmitter2;

  let testCompanyId: string;
  let testBuildingId: string;
  let testFloorId: string;
  let testPlanId: string;
  let deskId1: string;
  let deskId2: string;
  let testUserId1: string;
  let testUserId2: string;

  const testUserPayload1: AuthenticatedUserPayload = {
    id: '',
    email: 'concurrency-user-1@test.local',
    fullName: 'Concurrent Tester One',
    role: UserRole.EMPLOYEE,
    roles: [UserRole.EMPLOYEE],
    isRecoveryAdmin: false
  };

  const testUserPayload2: AuthenticatedUserPayload = {
    id: '',
    email: 'concurrency-user-2@test.local',
    fullName: 'Concurrent Tester Two',
    role: UserRole.EMPLOYEE,
    roles: [UserRole.EMPLOYEE],
    isRecoveryAdmin: false
  };

  beforeAll(async () => {
    dbService = new DatabaseService();
    await dbService.runPendingMigrations();

    eventEmitter = new EventEmitter2();
    reservationService = new ReservationEngineService(dbService, eventEmitter);

    const pool = dbService.getPool();

    // 1. Setup isolated test company, building, floor, floor plan, desks, and users
    const compRes = await pool.query(
      `INSERT INTO companies (name) VALUES ('Concurrency Test Org') RETURNING id`
    );
    testCompanyId = compRes.rows[0].id;

    const bldgRes = await pool.query(
      `INSERT INTO buildings (company_id, name) VALUES ($1, 'Concurrency Lab') RETURNING id`,
      [testCompanyId]
    );
    testBuildingId = bldgRes.rows[0].id;

    const flrRes = await pool.query(
      `INSERT INTO floors (building_id, floor_number, name) VALUES ($1, 99, 'Test Floor') RETURNING id`,
      [testBuildingId]
    );
    testFloorId = flrRes.rows[0].id;

    const planRes = await pool.query(
      `INSERT INTO floor_plans (floor_id, file_path, mime_type, width_px, height_px, version, is_active)
       VALUES ($1, '/test-plan.png', 'image/png', 1000, 1000, 1, TRUE) RETURNING id`,
      [testFloorId]
    );
    testPlanId = planRes.rows[0].id;

    const d1Res = await pool.query(
      `INSERT INTO desks (floor_id, floor_plan_id, code, label, x_coordinate_pct, y_coordinate_pct)
       VALUES ($1, $2, 'CC-01', 'Desk CC 1', 10.0, 10.0) RETURNING id`,
      [testFloorId, testPlanId]
    );
    deskId1 = d1Res.rows[0].id;

    const d2Res = await pool.query(
      `INSERT INTO desks (floor_id, floor_plan_id, code, label, x_coordinate_pct, y_coordinate_pct)
       VALUES ($1, $2, 'CC-02', 'Desk CC 2', 20.0, 20.0) RETURNING id`,
      [testFloorId, testPlanId]
    );
    deskId2 = d2Res.rows[0].id;

    const u1Res = await pool.query(
      `INSERT INTO users (email, full_name, auth_provider)
       VALUES ($1, $2, 'LOCAL') RETURNING id`,
      [testUserPayload1.email, testUserPayload1.fullName]
    );
    testUserId1 = u1Res.rows[0].id;
    testUserPayload1.id = testUserId1;

    const u2Res = await pool.query(
      `INSERT INTO users (email, full_name, auth_provider)
       VALUES ($1, $2, 'LOCAL') RETURNING id`,
      [testUserPayload2.email, testUserPayload2.fullName]
    );
    testUserId2 = u2Res.rows[0].id;
    testUserPayload2.id = testUserId2;
  });

  afterAll(async () => {
    const pool = dbService.getPool();
    // Clean up test data
    if (testCompanyId) {
      await pool.query(`DELETE FROM companies WHERE id = $1`, [testCompanyId]);
    }
    if (testUserId1) {
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [testUserId1, testUserId2]);
    }
    await dbService.onModuleDestroy();
  });

  it('strictly enforces only one personal reservation per user per date under true database concurrency', async () => {
    const targetDate = '2026-11-20';

    // Fire TWO simultaneous reservation requests for the SAME user on the SAME date for TWO DIFFERENT desks
    const results = await Promise.allSettled([
      reservationService.createReservation(testUserPayload1, {
        deskId: deskId1,
        reservationDate: targetDate,
        isGuest: false
      }),
      reservationService.createReservation(testUserPayload1, {
        deskId: deskId2,
        reservationDate: targetDate,
        isGuest: false
      })
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Exactly one must succeed
    expect(fulfilled).toHaveLength(1);
    // Exactly one must fail
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('You already have an active personal seat reservation');

    // Verify in database: exactly 1 CONFIRMED reservation exists for this user on targetDate
    const pool = dbService.getPool();
    const dbRows = await pool.query(
      `SELECT id, desk_id, status, is_guest FROM reservations 
       WHERE reserved_by_user_id = $1 AND reservation_date = $2 AND status = 'CONFIRMED'`,
      [testUserId1, targetDate]
    );
    expect(dbRows.rows).toHaveLength(1);
  });

  it('allows the same user to hold an active personal booking AND book a guest-proxy seat on the same date', async () => {
    const targetDate = '2026-11-21';

    // 1. Personal booking for User 1 on desk 1
    const personalBooking = await reservationService.createReservation(testUserPayload1, {
      deskId: deskId1,
      reservationDate: targetDate,
      isGuest: false
    });
    expect(personalBooking.status).toBe('CONFIRMED');

    // 2. Guest-proxy booking by User 1 on desk 2
    const guestBooking = await reservationService.createReservation(testUserPayload1, {
      deskId: deskId2,
      reservationDate: targetDate,
      isGuest: true,
      guestName: 'Guest Visitor External',
      guestEmail: 'guest@partner.org'
    });
    expect(guestBooking.status).toBe('CONFIRMED');
    expect(guestBooking.isGuest).toBe(true);
    expect(guestBooking.guestName).toBe('Guest Visitor External');

    // Verify database has both reservations
    const pool = dbService.getPool();
    const dbRows = await pool.query(
      `SELECT id, desk_id, is_guest FROM reservations 
       WHERE reserved_by_user_id = $1 AND reservation_date = $2 AND status = 'CONFIRMED'`,
      [testUserId1, targetDate]
    );
    expect(dbRows.rows).toHaveLength(2);
  });

  it('strictly prevents double-booking the same desk under concurrent requests by different users', async () => {
    const targetDate = '2026-11-22';

    // Two different users attempting to reserve the EXACT SAME DESK (deskId1) on the same date concurrently
    const results = await Promise.allSettled([
      reservationService.createReservation(testUserPayload1, {
        deskId: deskId1,
        reservationDate: targetDate,
        isGuest: false
      }),
      reservationService.createReservation(testUserPayload2, {
        deskId: deskId1,
        reservationDate: targetDate,
        isGuest: false
      })
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('already reserved by another user');
  });

  afterAll(async () => {
    try {
      const pool = dbService.getPool();
      if (testCompanyId) {
        await pool.query(`DELETE FROM companies WHERE id = $1`, [testCompanyId]);
      }
      if (testUserId1 || testUserId2) {
        await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [testUserId1, testUserId2]);
      }
      await dbService.onModuleDestroy();
    } catch {
      // Ignore cleanup error in teardown
    }
  });
});

