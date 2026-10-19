import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import {
  SetupStatusResponse,
  DatabaseTestResultDto,
  AuthProviderType
} from '@seat-reservation/contracts';
import { DatabaseService } from './infrastructure/database.service.js';
import { SetupLockManager } from './infrastructure/setup-lock.manager.js';
import { SetupPolicy } from './domain/setup-policy.js';
import { TestDatabaseDto } from './api/dto/test-database.dto.js';
import { InitializeSystemDto } from './api/dto/initialize-system.dto.js';

@Injectable()
export class SystemSetupService implements OnModuleInit {
  private readonly logger = new Logger(SystemSetupService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly lockManager: SetupLockManager
  ) {}

  async onModuleInit() {
    if (this.lockManager.isLocked()) {
      try {
        // Safe explicit demo cleanup: only delete entities explicitly flagged as is_demo = TRUE
        await this.databaseService.query(
          "DELETE FROM companies WHERE is_demo = TRUE"
        );
        await this.databaseService.query(
          "DELETE FROM users WHERE is_demo = TRUE AND is_recovery_admin = FALSE"
        );
        this.logger.log('Purged legacy evaluation demo data from initialized system.');
      } catch {
        // Ignore if database schema not yet created
      }
    }
  }

  public async getStatus(): Promise<SetupStatusResponse> {
    const isLocked = this.lockManager.isLocked();
    const lockedAt = this.lockManager.getLockTimestamp();

    let authProviderType = AuthProviderType.LOCAL;

    if (isLocked) {
      try {
        const result = await this.databaseService.query(
          'SELECT auth_provider_selected FROM setup_metadata ORDER BY completed_at DESC LIMIT 1'
        );
        if (result.rows.length > 0) {
          authProviderType = result.rows[0].auth_provider_selected as AuthProviderType;
        }
      } catch (err) {
        this.logger.warn(`Could not read setup_metadata table: ${(err as Error).message}`);
      }
    }

    return {
      isSetupCompleted: isLocked,
      setupLockedAt: lockedAt,
      authProviderType,
      installedVersion: '0.1.0'
    };
  }

  public async testDatabase(dto: TestDatabaseDto): Promise<DatabaseTestResultDto> {
    return this.databaseService.testConnection(dto);
  }

  public async initializeSystem(dto: InitializeSystemDto): Promise<SetupStatusResponse> {
    if (this.lockManager.isLocked()) {
      throw new ForbiddenException('System setup has already been completed and locked');
    }

    // 1. Domain validations
    const companyValidation = SetupPolicy.validateCompanyName(dto.companyName);
    if (companyValidation.isFailure) {
      throw new BadRequestException(companyValidation.getError());
    }

    const adminValidation = SetupPolicy.validateRecoveryAdmin(dto.recoveryAdmin);
    if (adminValidation.isFailure) {
      throw new BadRequestException(adminValidation.getError());
    }

    if (dto.authProvider?.type !== AuthProviderType.LOCAL) {
      throw new BadRequestException('OIDC authentication is not supported in this version. Only LOCAL authentication is currently supported.');
    }

    // 2. Validate DB connectivity
    const dbTest = await this.databaseService.testConnection(dto.database);
    if (!dbTest.success) {
      throw new BadRequestException(`Database connection test failed: ${dbTest.message}`);
    }

    // 3. Configure active pool with verified connection parameters
    this.databaseService.setConnectionConfig(dto.database);

    // 4. Run schema initialization & migrations
    await this.databaseService.initializeSchema();

    // 5. Create Company, Recovery Admin User, Role assignment
    const pool = this.databaseService.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Purge any preexisting evaluation demo sandbox data using explicit is_demo flags
      await client.query("DELETE FROM companies WHERE is_demo = TRUE");
      await client.query("DELETE FROM users WHERE is_demo = TRUE AND is_recovery_admin = FALSE");

      // Create company
      const companyRes = await client.query(
        'INSERT INTO companies (name) VALUES ($1) RETURNING id',
        [dto.companyName.trim()]
      );
      const companyId = companyRes.rows[0].id;

      // Create default building for initial setup
      await client.query(
        'INSERT INTO buildings (company_id, name, address) VALUES ($1, $2, $3)',
        [companyId, `${dto.companyName.trim()} Headquarters`, 'Main Campus']
      );

      // Hash master recovery password
      const passwordHash = await bcrypt.hash(dto.recoveryAdmin.password, 12);

      // Insert recovery admin user
      const userRes = await client.query(
        `INSERT INTO users (email, full_name, auth_provider, password_hash, is_recovery_admin, is_active)
         VALUES ($1, $2, 'LOCAL', $3, TRUE, TRUE)
         RETURNING id`,
        [dto.recoveryAdmin.email.toLowerCase().trim(), dto.recoveryAdmin.fullName.trim(), passwordHash]
      );
      const userId = userRes.rows[0].id;

      // Assign SYSTEM_ADMIN role
      const roleRes = await client.query(
        "SELECT id FROM roles WHERE role_name = 'SYSTEM_ADMIN'"
      );
      const roleId = roleRes.rows[0].id;

      await client.query(
        'INSERT INTO user_roles (user_id, role_id, building_scope_id) VALUES ($1, $2, NULL)',
        [userId, roleId]
      );

      // Write setup metadata
      const completedAt = new Date().toISOString();
      await client.query(
        `INSERT INTO setup_metadata (is_setup_completed, auth_provider_selected, installed_version, completed_at)
         VALUES (TRUE, $1, '0.1.0', $2)`,
        [dto.authProvider.type, completedAt]
      );

      // 5. Acquire physical lock file BEFORE committing or verify lock was successfully written
      const lockAcquired = this.lockManager.acquireLock(completedAt);
      if (!lockAcquired) {
        throw new InternalServerErrorException(
          'Failed to create system setup lock file on disk. System initialization rolled back to ensure consistency.'
        );
      }

      await client.query('COMMIT');

      this.logger.log(`System successfully initialized and locked for company ${dto.companyName}`);

      return {
        isSetupCompleted: true,
        setupLockedAt: completedAt,
        authProviderType: dto.authProvider.type,
        installedVersion: '0.1.0'
      };
    } catch (err) {
      this.lockManager.releaseLock();
      await client.query('ROLLBACK');
      this.logger.error('Failed to commit setup initialization', (err as Error).stack);
      throw err;
    } finally {
      client.release();
    }
  }
}

