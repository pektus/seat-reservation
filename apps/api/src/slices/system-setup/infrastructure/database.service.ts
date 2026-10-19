import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { DatabaseConnectionConfig, DatabaseTestResultDto } from '@seat-reservation/contracts';

const { Pool, Client } = pg;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: pg.Pool | null = null;

  async onModuleInit() {
    await this.runPendingMigrations();
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL database pool closed');
    }
  }

  public async runPendingMigrations(): Promise<void> {
    let applicationSchemaDetected = false;
    try {
      const pool = this.getPool();
      const client = await pool.connect();
      try {
        const tableCheck = await client.query(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name = ANY($1::text[])`,
          [[
            'companies',
            'buildings',
            'floors',
            'desks',
            'users',
            'roles',
            'reservations',
            'setup_metadata'
          ]]
        );
        if (tableCheck.rows.length === 0) {
          return;
        }
        applicationSchemaDetected = true;

        await client.query('BEGIN');

        // 1. Ensure floor_plans table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS floor_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
            file_path TEXT NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            width_px INT NOT NULL DEFAULT 1200,
            height_px INT NOT NULL DEFAULT 800,
            version INT NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        // 2. Ensure floor_plan_id column exists on desks table
        await client.query(`
          ALTER TABLE desks ADD COLUMN IF NOT EXISTS floor_plan_id UUID REFERENCES floor_plans(id) ON DELETE CASCADE;
        `);

        // 3. Relax legacy uq_floor_desk_code so desk codes are scoped per floor plan
        await client.query(`
          ALTER TABLE desks DROP CONSTRAINT IF EXISTS uq_floor_desk_code;
        `);

        // 4. Ensure desks are uniquely identified per floor plan
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_floor_plan_desk_code 
          ON desks (floor_plan_id, code) 
          WHERE is_active = TRUE AND floor_plan_id IS NOT NULL;
        `);

        // 5. Backfill any existing desks without floor_plan_id to their floor's active floor plan
        await client.query(`
          UPDATE desks d
          SET floor_plan_id = fp.id
          FROM floor_plans fp
          WHERE d.floor_id = fp.floor_id AND fp.is_active = TRUE AND d.floor_plan_id IS NULL;
        `);

        // 6. Ensure previous_floor_plan_id column exists on desks table to preserve plan relationship on replacement
        await client.query(`
          ALTER TABLE desks ADD COLUMN IF NOT EXISTS previous_floor_plan_id UUID REFERENCES floor_plans(id) ON DELETE SET NULL;
        `);

        // 7. Ensure is_demo boundary flags exist on all relevant tables
        await client.query(`
          ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE buildings ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE floors ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE desks ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE reservations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
        `);

        // 8. Ensure token_version exists on users for immediate privilege revocation
        await client.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;
        `);

        // 9. Atomic unique index: strictly enforce one personal reservation per user per date
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_one_personal_reservation_per_user_date 
          ON reservations (reserved_by_user_id, reservation_date) 
          WHERE status = 'CONFIRMED' AND is_guest = FALSE;
        `);

        await client.query('COMMIT');
        this.logger.log('Database schema migrations verified and applied.');
      } catch (err) {
        await client.query('ROLLBACK');
        this.logger.error('Failed to run database migrations', (err as Error).stack);
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (applicationSchemaDetected || process.env.NODE_ENV === 'production') {
        throw new Error(`CRITICAL: Database migration failed: ${err.message}`);
      }
      this.logger.warn(`Database connection during startup migration check: ${err.message}`);
    }
  }

  public getPool(): pg.Pool {
    if (!this.pool) {
      const isProduction = process.env.NODE_ENV === 'production';
      const dbPassword = process.env.DB_PASSWORD;
      if (isProduction && !dbPassword) {
        throw new Error('FATAL: DB_PASSWORD environment variable must be set in production mode.');
      }

      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'seatadmin',
        password: dbPassword || 'seatsecret123',
        database: process.env.DB_NAME || 'seat_reservation_db',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      this.pool.on('error', (err) => {
        this.logger.error('Unexpected error on idle PostgreSQL client', err);
      });
    }
    return this.pool;
  }

  public setConnectionConfig(config: DatabaseConnectionConfig): void {
    if (this.pool) {
      this.pool.end().catch(() => {});
      this.pool = null;
    }
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  public async testConnection(config: DatabaseConnectionConfig): Promise<DatabaseTestResultDto> {
    const client = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 4000
    });

    const startTime = Date.now();
    try {
      await client.connect();
      await client.query('SELECT 1 AS healthcheck');
      const latencyMs = Date.now() - startTime;
      await client.end();

      return {
        success: true,
        latencyMs,
        message: `Successfully connected to PostgreSQL at ${config.host}:${config.port}/${config.database} (${latencyMs}ms)`
      };
    } catch (err) {
      try {
        await client.end();
      } catch {
        // ignore client termination error
      }
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Connection failed: ${(err as Error).message}`
      };
    }
  }

  public async query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<pg.QueryResult<T>> {
    return this.getPool().query<T>(text, params);
  }

  public async initializeSchema(): Promise<void> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Setup metadata
      await client.query(`
        CREATE TABLE IF NOT EXISTS setup_metadata (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          is_setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
          auth_provider_selected VARCHAR(50) NOT NULL,
          installed_version VARCHAR(20) NOT NULL,
          completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 2. Companies
      await client.query(`
        CREATE TABLE IF NOT EXISTS companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(150) NOT NULL,
          is_demo BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 3. Buildings
      await client.query(`
        CREATE TABLE IF NOT EXISTS buildings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          name VARCHAR(150) NOT NULL,
          address TEXT,
          timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
          is_demo BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 4. Floors
      await client.query(`
        CREATE TABLE IF NOT EXISTS floors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
          floor_number INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          is_demo BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 5. Floor Plans
      await client.query(`
        CREATE TABLE IF NOT EXISTS floor_plans (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
          file_path TEXT NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          width_px INT NOT NULL DEFAULT 1200,
          height_px INT NOT NULL DEFAULT 800,
          version INT NOT NULL DEFAULT 1,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 6. Desks
      await client.query(`
        CREATE TABLE IF NOT EXISTS desks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
          floor_plan_id UUID REFERENCES floor_plans(id) ON DELETE CASCADE,
          previous_floor_plan_id UUID REFERENCES floor_plans(id) ON DELETE SET NULL,
          code VARCHAR(50) NOT NULL,
          label VARCHAR(100) NOT NULL,
          desk_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
          x_coordinate_pct NUMERIC(5, 2) NOT NULL,
          y_coordinate_pct NUMERIC(5, 2) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          needs_position_review BOOLEAN NOT NULL DEFAULT FALSE,
          is_demo BOOLEAN NOT NULL DEFAULT FALSE,
          amenities JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Ensure floor_plan_id and previous_floor_plan_id columns exist on desks table
      await client.query(`
        ALTER TABLE desks ADD COLUMN IF NOT EXISTS floor_plan_id UUID REFERENCES floor_plans(id) ON DELETE CASCADE;
        ALTER TABLE desks ADD COLUMN IF NOT EXISTS previous_floor_plan_id UUID REFERENCES floor_plans(id) ON DELETE SET NULL;
      `);

      // Relax legacy uq_floor_desk_code so desk codes are scoped per floor plan
      await client.query(`
        ALTER TABLE desks DROP CONSTRAINT IF EXISTS uq_floor_desk_code;
      `);

      // Ensure desks are uniquely identified per floor plan
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_floor_plan_desk_code 
        ON desks (floor_plan_id, code) 
        WHERE is_active = TRUE AND floor_plan_id IS NOT NULL;
      `);

      // Backfill any existing desks without floor_plan_id to their floor's active floor plan
      await client.query(`
        UPDATE desks d
        SET floor_plan_id = fp.id
        FROM floor_plans fp
        WHERE d.floor_id = fp.floor_id AND fp.is_active = TRUE AND d.floor_plan_id IS NULL;
      `);

      // 7. Users
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          full_name VARCHAR(150) NOT NULL,
          auth_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
          external_id VARCHAR(255),
          password_hash VARCHAR(255),
          is_recovery_admin BOOLEAN NOT NULL DEFAULT FALSE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          is_demo BOOLEAN NOT NULL DEFAULT FALSE,
          token_version INT NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
      `);

      // 8. Roles
      await client.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          role_name VARCHAR(50) UNIQUE NOT NULL
        );
      `);

      // Seed core roles
      await client.query(`
        INSERT INTO roles (role_name) VALUES 
          ('SYSTEM_ADMIN'),
          ('BUILDING_MANAGER'),
          ('EMPLOYEE')
        ON CONFLICT (role_name) DO NOTHING;
      `);

      // 9. User Roles mapping
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          building_scope_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
          CONSTRAINT uq_user_role_scope UNIQUE (user_id, role_id, building_scope_id)
        );
      `);

      // 10. Reservations with atomic partial unique index
      await client.query(`
        CREATE TABLE IF NOT EXISTS reservations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          desk_id UUID NOT NULL REFERENCES desks(id) ON DELETE CASCADE,
          reserved_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reservation_date DATE NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
          is_guest BOOLEAN NOT NULL DEFAULT FALSE,
          is_demo BOOLEAN NOT NULL DEFAULT FALSE,
          guest_name VARCHAR(150),
          guest_email VARCHAR(255),
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          cancelled_at TIMESTAMPTZ
        );
      `);

      await client.query(`
        ALTER TABLE reservations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
      `);

      // Race-condition prevention index for same desk
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_active_desk_reservation_per_date 
        ON reservations (desk_id, reservation_date) 
        WHERE status = 'CONFIRMED';
      `);

      // Atomic unique index: strictly enforce one personal reservation per user per date
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_one_personal_reservation_per_user_date 
        ON reservations (reserved_by_user_id, reservation_date) 
        WHERE status = 'CONFIRMED' AND is_guest = FALSE;
      `);

      // 11. Audit Logs
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          event_type VARCHAR(100) NOT NULL,
          aggregate_type VARCHAR(50) NOT NULL,
          aggregate_id UUID,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query('COMMIT');
      this.logger.log('PostgreSQL database schema initialized successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to initialize PostgreSQL schema', (err as Error).stack);
      throw err;
    } finally {
      client.release();
    }
  }
}
