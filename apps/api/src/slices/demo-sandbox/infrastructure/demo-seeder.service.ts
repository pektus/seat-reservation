import { Injectable, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import {
  SeedDemoDataResponse,
  ResetDemoDataResponse,
  DeskType
} from '@seat-reservation/contracts';
import { DatabaseService } from '../../system-setup/infrastructure/database.service.js';

@Injectable()
export class DemoSeederService {
  private readonly logger = new Logger(DemoSeederService.name);

  // Pre-configured 12 hot-desks matching the SVG floor plan layout pods
  private readonly DEMO_DESKS = [
    // Pod 1 (Window & Quiet)
    { code: 'D-01', label: 'Window Desk 1', type: DeskType.STANDARD, x: 36.8, y: 34.0, amenities: ['Dual Monitors', 'Window View'] },
    { code: 'D-02', label: 'Window Desk 2', type: DeskType.STANDARD, x: 41.5, y: 34.0, amenities: ['Single 4K Monitor', 'Window View'] },
    { code: 'D-03', label: 'Quiet Desk 3', type: DeskType.QUIET, x: 36.8, y: 49.0, amenities: ['Noise-Canceling Pod', 'Ergonomic Chair'] },
    { code: 'D-04', label: 'Quiet Desk 4', type: DeskType.QUIET, x: 41.5, y: 49.0, amenities: ['Noise-Canceling Pod'] },

    // Pod 2 (Team & Collaboration)
    { code: 'D-05', label: 'Team Desk 5', type: DeskType.COLLABORATIVE, x: 48.5, y: 34.0, amenities: ['Whiteboard Access'] },
    { code: 'D-06', label: 'Team Desk 6', type: DeskType.COLLABORATIVE, x: 53.2, y: 34.0, amenities: ['Whiteboard Access', 'Conference Speaker'] },
    { code: 'D-07', label: 'Team Desk 7', type: DeskType.COLLABORATIVE, x: 48.5, y: 49.0, amenities: ['Dual Monitors'] },
    { code: 'D-08', label: 'Team Desk 8', type: DeskType.COLLABORATIVE, x: 53.2, y: 49.0, amenities: ['Dual Monitors'] },

    // Pod 3 (Electric Standing Desks)
    { code: 'D-09', label: 'Standing Desk 9', type: DeskType.STANDING, x: 60.8, y: 34.0, amenities: ['Motorized Height Adjustable', 'Ergonomic Mat'] },
    { code: 'D-10', label: 'Standing Desk 10', type: DeskType.STANDING, x: 65.5, y: 34.0, amenities: ['Motorized Height Adjustable'] },
    { code: 'D-11', label: 'Standing Desk 11', type: DeskType.STANDING, x: 60.8, y: 49.0, amenities: ['Motorized Height Adjustable', 'Dual 4K Displays'] },
    { code: 'D-12', label: 'Standing Desk 12', type: DeskType.STANDING, x: 65.5, y: 49.0, amenities: ['Motorized Height Adjustable'] }
  ];

  constructor(private readonly databaseService: DatabaseService) {}

  public async seedDemoData(): Promise<SeedDemoDataResponse> {
    this.logger.log('Seeding demo workplace environment...');
    // Ensure database tables exist even if setup wizard has not been run
    await this.databaseService.initializeSchema();

    const pool = this.databaseService.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Company
      let companyId: string;
      const compRes = await client.query(
        'SELECT id FROM companies WHERE is_demo = TRUE AND name = $1 LIMIT 1',
        ['Acme Tech HQ']
      );
      if (compRes.rows.length > 0) {
        companyId = compRes.rows[0].id;
      } else {
        const newComp = await client.query(
          'INSERT INTO companies (name, is_demo) VALUES ($1, TRUE) RETURNING id',
          ['Acme Tech HQ']
        );
        companyId = newComp.rows[0].id;
      }

      // 2. Building
      let buildingId: string;
      const bldgRes = await client.query(
        'SELECT id FROM buildings WHERE company_id = $1 AND is_demo = TRUE AND name = $2 LIMIT 1',
        [companyId, 'Main Tower (Campus A)']
      );
      if (bldgRes.rows.length > 0) {
        buildingId = bldgRes.rows[0].id;
      } else {
        const newBldg = await client.query(
          `INSERT INTO buildings (company_id, name, address, timezone, is_demo)
           VALUES ($1, $2, $3, 'America/New_York', TRUE)
           RETURNING id`,
          [companyId, 'Main Tower (Campus A)', '100 Innovation Parkway']
        );
        buildingId = newBldg.rows[0].id;
      }

      // 3. Floor
      let floorId: string;
      const flrRes = await client.query(
        'SELECT id FROM floors WHERE building_id = $1 AND floor_number = 4 AND is_demo = TRUE LIMIT 1',
        [buildingId]
      );
      if (flrRes.rows.length > 0) {
        floorId = flrRes.rows[0].id;
      } else {
        const newFlr = await client.query(
          `INSERT INTO floors (building_id, floor_number, name, is_demo)
           VALUES ($1, 4, $2, TRUE)
           RETURNING id`,
          [buildingId, 'Floor 4 — Open Office & Collaboration']
        );
        floorId = newFlr.rows[0].id;
      }

      // 4. Floor plan
      let floorPlanId: string;
      const planRes = await client.query(
        'SELECT id FROM floor_plans WHERE floor_id = $1 AND is_active = TRUE LIMIT 1',
        [floorId]
      );
      if (planRes.rows.length === 0) {
        const newPlan = await client.query(
          `INSERT INTO floor_plans (floor_id, file_path, mime_type, width_px, height_px, version, is_active)
           VALUES ($1, '/floorplan-office.jpg', 'image/jpeg', 1920, 1080, 1, TRUE)
           RETURNING id`,
          [floorId]
        );
        floorPlanId = newPlan.rows[0].id;
      } else {
        floorPlanId = planRes.rows[0].id;
      }

      // 5. Desks
      for (const desk of this.DEMO_DESKS) {
        await client.query(
          `INSERT INTO desks (floor_id, floor_plan_id, code, label, desk_type, x_coordinate_pct, y_coordinate_pct, amenities, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
           ON CONFLICT DO NOTHING`,
          [
            floorId,
            floorPlanId,
            desk.code,
            desk.label,
            desk.type,
            desk.x,
            desk.y,
            JSON.stringify(desk.amenities)
          ]
        );
      }

      // 6. Demo Employee User
      let employeeUserId: string;
      const demoEmail = 'demo.employee@acme.local';
      let userRes = await client.query(
        'SELECT id FROM users WHERE email = $1 AND is_demo = TRUE LIMIT 1',
        [demoEmail]
      );
      if (userRes.rows.length === 0) {
        userRes = await client.query(
          'SELECT id FROM users WHERE email = $1 AND is_demo = TRUE LIMIT 1',
          ['employee@acme.local']
        );
      }
      if (userRes.rows.length > 0) {
        employeeUserId = userRes.rows[0].id;
      } else {
        const checkAvail = await client.query(
          'SELECT id FROM users WHERE email = $1 LIMIT 1',
          ['employee@acme.local']
        );
        const targetEmail = checkAvail.rows.length === 0 ? 'employee@acme.local' : demoEmail;
        const hash = await bcrypt.hash('DemoEmployee123!', 10);
        const newUser = await client.query(
          `INSERT INTO users (email, full_name, password_hash, auth_provider, is_active, is_demo)
           VALUES ($1, 'Sarah Connor (Demo Employee)', $2, 'LOCAL', TRUE, TRUE)
           RETURNING id`,
          [targetEmail, hash]
        );
        employeeUserId = newUser.rows[0].id;

        const roleRes = await client.query(
          "SELECT id FROM roles WHERE role_name = 'EMPLOYEE'"
        );
        if (roleRes.rows.length > 0) {
          await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [employeeUserId, roleRes.rows[0].id]
          );
        }
      }

      // 7. Seed Sample Bookings on Today's Date
      const todayStr = new Date().toISOString().split('T')[0];

      // Sample booking 1: D-02 reserved by Sarah
      const desk2Res = await client.query(
        "SELECT id FROM desks WHERE floor_id = $1 AND code = 'D-02' AND is_demo = TRUE",
        [floorId]
      );
      if (desk2Res.rows.length > 0) {
        await client.query(
          `INSERT INTO reservations (desk_id, reserved_by_user_id, reservation_date, status, is_guest, is_demo)
           VALUES ($1, $2, $3, 'CONFIRMED', FALSE, TRUE)
           ON CONFLICT (desk_id, reservation_date) WHERE status = 'CONFIRMED' DO NOTHING`,
          [desk2Res.rows[0].id, employeeUserId, todayStr]
        );
      }

      // Sample booking 2: D-06 reserved for an external visitor guest
      const desk6Res = await client.query(
        "SELECT id FROM desks WHERE floor_id = $1 AND code = 'D-06' AND is_demo = TRUE",
        [floorId]
      );
      if (desk6Res.rows.length > 0) {
        await client.query(
          `INSERT INTO reservations (desk_id, reserved_by_user_id, reservation_date, status, is_guest, guest_name, guest_email, is_demo)
           VALUES ($1, $2, $3, 'CONFIRMED', TRUE, 'Alex Morgan (Guest)', 'alex@partner.com', TRUE)
           ON CONFLICT (desk_id, reservation_date) WHERE status = 'CONFIRMED' DO NOTHING`,
          [desk6Res.rows[0].id, employeeUserId, todayStr]
        );
      }

      // Sample booking 3: D-11 reserved
      const desk11Res = await client.query(
        "SELECT id FROM desks WHERE floor_id = $1 AND code = 'D-11' AND is_demo = TRUE",
        [floorId]
      );
      if (desk11Res.rows.length > 0) {
        await client.query(
          `INSERT INTO reservations (desk_id, reserved_by_user_id, reservation_date, status, is_guest, guest_name, is_demo)
           VALUES ($1, $2, $3, 'CONFIRMED', TRUE, 'Marcus Wright (Auditor)', TRUE)
           ON CONFLICT (desk_id, reservation_date) WHERE status = 'CONFIRMED' DO NOTHING`,
          [desk11Res.rows[0].id, employeeUserId, todayStr]
        );
      }

      // Flag D-10 for review demonstration
      await client.query(
        "UPDATE desks SET needs_position_review = TRUE WHERE floor_id = $1 AND code = 'D-10' AND is_demo = TRUE",
        [floorId]
      );

      await client.query('COMMIT');

      this.logger.log('Demo workplace seeded successfully');

      return {
        success: true,
        message: 'Demo workplace successfully seeded with 12 hot-desks and sample reservations',
        demoCompany: {
          id: companyId,
          name: 'Acme Tech HQ'
        },
        demoBuilding: {
          id: buildingId,
          name: 'Main Tower (Campus A)'
        },
        demoFloor: {
          id: floorId,
          name: 'Floor 4 — Open Office & Collaboration',
          desksCount: this.DEMO_DESKS.length
        },
        demoSampleDate: todayStr
      };
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to seed demo data', (err as Error).stack);
      throw err;
    } finally {
      client.release();
    }
  }

  public async resetDemoData(): Promise<ResetDemoDataResponse> {
    this.logger.log('Resetting demo sandbox reservations to baseline...');

    // 1. Cancel any user-created reservations on demo desks (is_demo = FALSE)
    const res = await this.databaseService.query(
      `UPDATE reservations
       SET status = 'CANCELLED', cancelled_at = NOW()
       WHERE status = 'CONFIRMED'
         AND is_demo = FALSE
         AND desk_id IN (
           SELECT id FROM desks WHERE is_demo = TRUE
         )`
    );

    const clearedCount = res.rowCount || 0;

    // 2. Fetch demo floor and employee user
    const demoFloorRes = await this.databaseService.query(
      `SELECT f.id as floor_id, u.id as user_id
       FROM floors f
       JOIN buildings b ON f.building_id = b.id
       JOIN companies c ON b.company_id = c.id
       LEFT JOIN users u ON u.email = 'employee@acme.local' AND u.is_demo = TRUE
       WHERE f.is_demo = TRUE AND b.is_demo = TRUE AND c.is_demo = TRUE
       LIMIT 1`
    );

    if (demoFloorRes.rows.length > 0 && demoFloorRes.rows[0].user_id) {
      const floorId = demoFloorRes.rows[0].floor_id;
      const employeeUserId = demoFloorRes.rows[0].user_id;
      const todayStr = new Date().toISOString().split('T')[0];

      // Re-assert baseline seeded reservations on D-02, D-06, D-11
      const sampleDesks = await this.databaseService.query(
        `SELECT id, code FROM desks WHERE floor_id = $1 AND is_demo = TRUE AND code IN ('D-02', 'D-06', 'D-11')`,
        [floorId]
      );
      const deskMap = new Map(sampleDesks.rows.map((r: any) => [r.code, r.id]));

      if (deskMap.has('D-02')) {
        await this.databaseService.query(
          `INSERT INTO reservations (desk_id, reserved_by_user_id, reservation_date, status, is_guest, is_demo)
           VALUES ($1, $2, $3, 'CONFIRMED', FALSE, TRUE)
           ON CONFLICT (desk_id, reservation_date) WHERE status = 'CONFIRMED' DO NOTHING`,
          [deskMap.get('D-02'), employeeUserId, todayStr]
        );
      }
      if (deskMap.has('D-06')) {
        await this.databaseService.query(
          `INSERT INTO reservations (desk_id, reserved_by_user_id, reservation_date, status, is_guest, guest_name, guest_email, is_demo)
           VALUES ($1, $2, $3, 'CONFIRMED', TRUE, 'Alex Morgan (Guest)', 'alex@partner.com', TRUE)
           ON CONFLICT (desk_id, reservation_date) WHERE status = 'CONFIRMED' DO NOTHING`,
          [deskMap.get('D-06'), employeeUserId, todayStr]
        );
      }
      if (deskMap.has('D-11')) {
        await this.databaseService.query(
          `INSERT INTO reservations (desk_id, reserved_by_user_id, reservation_date, status, is_guest, guest_name, is_demo)
           VALUES ($1, $2, $3, 'CONFIRMED', TRUE, 'Marcus Wright (Auditor)', TRUE)
           ON CONFLICT (desk_id, reservation_date) WHERE status = 'CONFIRMED' DO NOTHING`,
          [deskMap.get('D-11'), employeeUserId, todayStr]
        );
      }
    }

    // 3. Reset review flags strictly on demo desks
    await this.databaseService.query(
      `UPDATE desks
       SET needs_position_review = (code = 'D-10')
       WHERE is_demo = TRUE`
    );

    return {
      success: true,
      clearedReservationsCount: clearedCount,
      message: `Successfully reset demo sandbox to baseline. Cleared ${clearedCount} user reservations and restored baseline sample state.`
    };
  }
}

