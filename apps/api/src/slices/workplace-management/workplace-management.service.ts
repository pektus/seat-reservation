import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException
} from '@nestjs/common';
import {
  BuildingDto,
  FloorDto,
  FloorPlanDto,
  DeskDto,
  DeskType,
  UserRole
} from '@seat-reservation/contracts';
import { DatabaseService } from '../system-setup/infrastructure/database.service.js';
import { DeskPlacementPolicy } from './domain/desk-placement-policy.js';
import { CreateBuildingDto } from './api/dto/create-building.dto.js';
import { CreateFloorDto } from './api/dto/create-floor.dto.js';
import { UploadFloorPlanDto } from './api/dto/upload-floor-plan.dto.js';
import { CreateDeskDto } from './api/dto/create-desk.dto.js';
import { UpdateDeskCoordinatesDto } from './api/dto/update-desk-coordinates.dto.js';
import { AuthenticatedUserPayload } from '../identity-access/decorators/current-user.decorator.js';

@Injectable()
export class WorkplaceManagementService {
  private readonly logger = new Logger(WorkplaceManagementService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  public assertBuildingScope(user?: AuthenticatedUserPayload, buildingId?: string): void {
    if (!user) {
      return;
    }

    if (user.isRecoveryAdmin || user.roles?.includes(UserRole.SYSTEM_ADMIN)) {
      return;
    }

    if (user.roles?.includes(UserRole.BUILDING_MANAGER)) {
      if (!buildingId) {
        throw new ForbiddenException('Building ID is required for authorization');
      }
      const allowedScopes = [
        ...(user.buildingScopeIds || []),
        ...(user.buildingScopeId ? [user.buildingScopeId] : [])
      ];
      if (!allowedScopes.includes(buildingId)) {
        throw new ForbiddenException(`Building Manager does not have authorization for building '${buildingId}'`);
      }
      return;
    }

    throw new ForbiddenException('Insufficient permissions to manage workplace resources');
  }

  public async assertFloorBuildingScope(user: AuthenticatedUserPayload | undefined, floorId: string): Promise<string> {
    if (!user || user.isRecoveryAdmin || user.roles?.includes(UserRole.SYSTEM_ADMIN)) {
      return '';
    }
    const res = await this.databaseService.query(
      `SELECT building_id FROM floors WHERE id = $1`,
      [floorId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Floor not found');
    }
    const buildingId = res.rows[0].building_id;
    this.assertBuildingScope(user, buildingId);
    return buildingId;
  }

  public async assertDeskBuildingScope(user: AuthenticatedUserPayload | undefined, deskId: string): Promise<string> {
    if (!user || user.isRecoveryAdmin || user.roles?.includes(UserRole.SYSTEM_ADMIN)) {
      return '';
    }
    const res = await this.databaseService.query(
      `SELECT f.building_id FROM desks d JOIN floors f ON d.floor_id = f.id WHERE d.id = $1`,
      [deskId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Desk not found');
    }
    const buildingId = res.rows[0].building_id;
    this.assertBuildingScope(user, buildingId);
    return buildingId;
  }

  public async listBuildings(user?: AuthenticatedUserPayload): Promise<BuildingDto[]> {
    const isManager = Boolean(user && (user.role === UserRole.BUILDING_MANAGER || user.roles?.includes(UserRole.BUILDING_MANAGER)));
    const isAdmin = Boolean(user && (user.role === UserRole.SYSTEM_ADMIN || user.roles?.includes(UserRole.SYSTEM_ADMIN)));

    let query = `SELECT id, company_id, name, address, timezone FROM buildings`;
    const params: any[] = [];

    if (isManager && !isAdmin) {
      const allowedScopes = user.buildingScopeIds || (user.buildingScopeId ? [user.buildingScopeId] : []);
      if (allowedScopes.length === 0) {
        return [];
      }
      query += ` WHERE id = ANY($1)`;
      params.push(allowedScopes);
    }

    query += ` ORDER BY created_at ASC`;
    const res = await this.databaseService.query(query, params);

    return res.rows.map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      address: row.address || '',
      timezone: row.timezone
    }));
  }

  public async listCompanies(): Promise<{ id: string; name: string }[]> {
    const res = await this.databaseService.query(
      `SELECT id, name FROM companies ORDER BY created_at ASC`
    );
    return res.rows.map((row: any) => ({
      id: row.id,
      name: row.name
    }));
  }

  public async createCompany(name: string): Promise<{ id: string; name: string }> {
    const res = await this.databaseService.query(
      `INSERT INTO companies (name) VALUES ($1) RETURNING id, name`,
      [name.trim()]
    );
    return res.rows[0];
  }

  public async createBuilding(dto: CreateBuildingDto): Promise<BuildingDto> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let targetCompanyId = dto.companyId;
    if (!UUID_REGEX.test(targetCompanyId)) {
      const compRes = await this.databaseService.query(`SELECT id FROM companies LIMIT 1`);
      if (compRes.rows.length > 0) {
        targetCompanyId = compRes.rows[0].id;
      } else {
        const newComp = await this.createCompany('Default Organization');
        targetCompanyId = newComp.id;
      }
    }

    const res = await this.databaseService.query(
      `INSERT INTO buildings (company_id, name, address, timezone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, company_id, name, address, timezone`,
      [targetCompanyId, dto.name.trim(), dto.address?.trim() || null, dto.timezone || 'UTC']
    );

    const row = res.rows[0];
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      address: row.address || '',
      timezone: row.timezone
    };
  }

  public async listFloors(buildingId: string, user?: AuthenticatedUserPayload): Promise<FloorDto[]> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(buildingId)) {
      return [];
    }

    const isManager = Boolean(user && (user.role === UserRole.BUILDING_MANAGER || user.roles?.includes(UserRole.BUILDING_MANAGER)));
    const isAdmin = Boolean(user && (user.role === UserRole.SYSTEM_ADMIN || user.roles?.includes(UserRole.SYSTEM_ADMIN)));

    if (isManager && !isAdmin) {
      const allowedScopes = user.buildingScopeIds || (user.buildingScopeId ? [user.buildingScopeId] : []);
      if (!allowedScopes.includes(buildingId)) {
        throw new ForbiddenException('You do not have permission to view floors for this building');
      }
    }

    const res = await this.databaseService.query(
      `SELECT f.id, f.building_id, f.floor_number, f.name, fp.id as active_floor_plan_id, fp.file_path as active_floor_plan_path
       FROM floors f
       LEFT JOIN floor_plans fp ON fp.floor_id = f.id AND fp.is_active = TRUE
       WHERE f.building_id = $1
       ORDER BY f.floor_number ASC`,
      [buildingId]
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      buildingId: row.building_id,
      floorNumber: row.floor_number,
      name: row.name,
      activeFloorPlanId: row.active_floor_plan_id || undefined,
      activeFloorPlanPath: row.active_floor_plan_path || undefined
    }));
  }

  public async createFloor(dto: CreateFloorDto, user?: AuthenticatedUserPayload): Promise<FloorDto> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(dto.buildingId)) {
      throw new BadRequestException('Invalid building ID format');
    }

    this.assertBuildingScope(user, dto.buildingId);

    const res = await this.databaseService.query(
      `INSERT INTO floors (building_id, floor_number, name)
       VALUES ($1, $2, $3)
       RETURNING id, building_id, floor_number, name`,
      [dto.buildingId, Number(dto.floorNumber), dto.name.trim()]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      buildingId: row.building_id,
      floorNumber: row.floor_number,
      name: row.name
    };
  }

  public async uploadOrReplaceFloorPlan(
    floorId: string,
    dto: UploadFloorPlanDto,
    user?: AuthenticatedUserPayload
  ): Promise<FloorPlanDto> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(floorId)) {
      throw new BadRequestException('Invalid floor ID format');
    }

    await this.assertFloorBuildingScope(user, floorId);

    // Maximum upload size: 5MB
    const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
    const approximateBytes = dto.filePath.startsWith('data:')
      ? Math.ceil((dto.filePath.length * 3) / 4)
      : Buffer.byteLength(dto.filePath, 'utf-8');

    if (approximateBytes > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Floor plan upload exceeds maximum allowed size of 5MB');
    }

    let mimeType = dto.mimeType;
    if (!mimeType || mimeType === 'application/octet-stream' || mimeType === 'binary/octet-stream') {
      if (dto.filePath.startsWith('data:image/')) {
        const match = dto.filePath.match(/^data:(image\/[^;]+);/);
        if (match) mimeType = match[1];
      } else if (dto.filePath.toLowerCase().endsWith('.svg') || dto.filePath.includes('<svg')) {
        mimeType = 'image/svg+xml';
      } else if (dto.filePath.toLowerCase().endsWith('.png')) {
        mimeType = 'image/png';
      } else if (dto.filePath.toLowerCase().endsWith('.jpg') || dto.filePath.toLowerCase().endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (dto.filePath.toLowerCase().endsWith('.webp')) {
        mimeType = 'image/webp';
      }
    }

    if (!DeskPlacementPolicy.isAllowedFloorPlanMimeType(mimeType)) {
      throw new BadRequestException(
        `Invalid floor plan format: ${mimeType}. Only PNG, JPEG, SVG, and WebP images are supported.`
      );
    }

    // SVG security inspection: block active scripts, embedded event handlers, or external entity expansions
    if (mimeType === 'image/svg+xml' || dto.filePath.includes('<svg')) {
      let svgContent = dto.filePath;
      if (dto.filePath.startsWith('data:image/svg+xml;base64,')) {
        try {
          svgContent = Buffer.from(dto.filePath.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf-8');
        } catch {
          throw new BadRequestException('Invalid base64 encoding for SVG floor plan');
        }
      } else if (dto.filePath.startsWith('data:image/svg+xml,')) {
        svgContent = decodeURIComponent(dto.filePath.replace(/^data:image\/svg\+xml,/, ''));
      }

      const dangerousPatterns = [
        /<script\b/i,
        /\bon\w+\s*=/i,
        /<foreignObject\b/i,
        /<iframe\b/i,
        /javascript\s*:/i,
        /<!ENTITY\b/i,
        /\bSYSTEM\b/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(svgContent)) {
          throw new BadRequestException(
            'Uploaded SVG contains disallowed active content, script tags, or external entities. Please upload a clean, static vector floor plan.'
          );
        }
      }
    }

    const pool = this.databaseService.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const floorCheck = await client.query('SELECT id FROM floors WHERE id = $1', [floorId]);
      if (floorCheck.rows.length === 0) {
        throw new NotFoundException('Floor not found');
      }

      // Check current active plan and max version
      const versionRes = await client.query(
        `SELECT COALESCE(MAX(version), 0) as max_version, COUNT(*) as existing_plans_count
         FROM floor_plans
         WHERE floor_id = $1`,
        [floorId]
      );

      // Fetch prior active floor plan id (if any)
      const priorActiveRes = await client.query(
        `SELECT id FROM floor_plans WHERE floor_id = $1 AND is_active = TRUE LIMIT 1`,
        [floorId]
      );
      const priorActivePlanId = priorActiveRes.rows[0]?.id || null;

      const nextVersion = Number(versionRes.rows[0].max_version) + 1;
      const hadPreviousPlan = Number(versionRes.rows[0].existing_plans_count) > 0;

      // Deactivate prior plans
      if (hadPreviousPlan) {
        await client.query(
          `UPDATE floor_plans SET is_active = FALSE WHERE floor_id = $1`,
          [floorId]
        );
      }

      // Insert new floor plan
      const insertRes = await client.query(
        `INSERT INTO floor_plans (floor_id, file_path, mime_type, width_px, height_px, version, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING id, floor_id, file_path, mime_type, width_px, height_px, version, is_active, uploaded_at`,
        [
          floorId,
          dto.filePath,
          mimeType,
          dto.widthPx || 1200,
          dto.heightPx || 800,
          nextVersion
        ]
      );

      const newPlanId = insertRes.rows[0].id;

      // When replacing an existing floor plan, flag all existing desk positions on that floor for review
      // and preserve their relationship to the prior plan via previous_floor_plan_id
      if (hadPreviousPlan) {
        await client.query(
          `UPDATE desks
           SET previous_floor_plan_id = COALESCE(previous_floor_plan_id, floor_plan_id, $1),
               floor_plan_id = $2,
               needs_position_review = TRUE
           WHERE floor_id = $3 AND is_active = TRUE`,
          [priorActivePlanId, newPlanId, floorId]
        );
      }

      await client.query('COMMIT');
      const row = insertRes.rows[0];

      return {
        id: row.id,
        floorId: row.floor_id,
        filePath: row.file_path,
        mimeType: row.mime_type,
        widthPx: row.width_px,
        heightPx: row.height_px,
        version: row.version,
        isActive: row.is_active,
        uploadedAt: row.uploaded_at.toISOString()
      };
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to upload/replace floor plan', (err as Error).stack);
      throw err;
    } finally {
      client.release();
    }
  }

  public async listFloorPlans(floorId: string, user?: AuthenticatedUserPayload): Promise<FloorPlanDto[]> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(floorId)) {
      return [];
    }

    const isManager = Boolean(user && (user.role === UserRole.BUILDING_MANAGER || user.roles?.includes(UserRole.BUILDING_MANAGER)));
    const isAdmin = Boolean(user && (user.role === UserRole.SYSTEM_ADMIN || user.roles?.includes(UserRole.SYSTEM_ADMIN)));

    if (isManager && !isAdmin) {
      await this.assertFloorBuildingScope(user, floorId);
    }

    const res = await this.databaseService.query(
      `SELECT id, floor_id, file_path, mime_type, width_px, height_px, version, is_active, uploaded_at
       FROM floor_plans
       WHERE floor_id = $1
       ORDER BY version DESC`,
      [floorId]
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      floorId: row.floor_id,
      filePath: row.file_path,
      mimeType: row.mime_type,
      widthPx: row.width_px,
      heightPx: row.height_px,
      version: row.version,
      isActive: row.is_active,
      uploadedAt: row.uploaded_at.toISOString()
    }));
  }

  public async listWorkplaceFloorPlanLibrary(): Promise<FloorPlanDto[]> {
    const res = await this.databaseService.query(
      `SELECT DISTINCT ON (file_path) id, floor_id, file_path, mime_type, width_px, height_px, version, is_active, uploaded_at
       FROM floor_plans
       ORDER BY file_path, uploaded_at DESC`
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      floorId: row.floor_id,
      filePath: row.file_path,
      mimeType: row.mime_type,
      widthPx: row.width_px,
      heightPx: row.height_px,
      version: row.version,
      isActive: row.is_active,
      uploadedAt: row.uploaded_at.toISOString()
    }));
  }

  public async activateFloorPlan(
    floorId: string,
    planId: string,
    user?: AuthenticatedUserPayload
  ): Promise<FloorPlanDto> {
    await this.assertFloorBuildingScope(user, floorId);
    const pool = this.databaseService.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE floor_plans SET is_active = FALSE WHERE floor_id = $1`,
        [floorId]
      );
      const res = await client.query(
        `UPDATE floor_plans SET is_active = TRUE WHERE id = $1 AND floor_id = $2
         RETURNING id, floor_id, file_path, mime_type, width_px, height_px, version, is_active, uploaded_at`,
        [planId, floorId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundException('Floor plan not found');
      }
      await client.query('COMMIT');
      const row = res.rows[0];
      return {
        id: row.id,
        floorId: row.floor_id,
        filePath: row.file_path,
        mimeType: row.mime_type,
        widthPx: row.width_px,
        heightPx: row.height_px,
        version: row.version,
        isActive: row.is_active,
        uploadedAt: row.uploaded_at.toISOString()
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async deleteFloorPlan(
    floorId: string,
    planId: string,
    user?: AuthenticatedUserPayload
  ): Promise<void> {
    await this.assertFloorBuildingScope(user, floorId);
    const pool = this.databaseService.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const checkRes = await client.query(
        `SELECT is_active FROM floor_plans WHERE id = $1 AND floor_id = $2`,
        [planId, floorId]
      );
      if (checkRes.rows.length === 0) {
        throw new NotFoundException('Floor plan not found');
      }
      const wasActive = checkRes.rows[0].is_active;

      // Delete the floor plan (desks cascade automatically)
      await client.query(`DELETE FROM floor_plans WHERE id = $1`, [planId]);

      // If this plan was active, activate the latest remaining plan if any
      if (wasActive) {
        const remaining = await client.query(
          `SELECT id FROM floor_plans WHERE floor_id = $1 ORDER BY version DESC LIMIT 1`,
          [floorId]
        );
        if (remaining.rows.length > 0) {
          await client.query(
            `UPDATE floor_plans SET is_active = TRUE WHERE id = $1`,
            [remaining.rows[0].id]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async listDesksForFloor(floorId: string, floorPlanId?: string): Promise<DeskDto[]> {
    let targetPlanId = floorPlanId;
    if (!targetPlanId) {
      const planRes = await this.databaseService.query(
        `SELECT id FROM floor_plans WHERE floor_id = $1 AND is_active = TRUE LIMIT 1`,
        [floorId]
      );
      if (planRes.rows.length > 0) {
        targetPlanId = planRes.rows[0].id;
      }
    }

    if (!targetPlanId) {
      return [];
    }

    const res = await this.databaseService.query(
      `SELECT id, floor_id, floor_plan_id, code, label, desk_type, x_coordinate_pct, y_coordinate_pct, is_active, needs_position_review, amenities
       FROM desks
       WHERE floor_id = $1 AND floor_plan_id = $2 AND is_active = TRUE
       ORDER BY code ASC`,
      [floorId, targetPlanId]
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      floorId: row.floor_id,
      floorPlanId: row.floor_plan_id,
      code: row.code,
      label: row.label,
      deskType: row.desk_type as DeskType,
      xCoordinatePct: Number(row.x_coordinate_pct),
      yCoordinatePct: Number(row.y_coordinate_pct),
      isActive: row.is_active,
      needsPositionReview: row.needs_position_review,
      amenities: row.amenities || []
    }));
  }

  public async createDesk(dto: CreateDeskDto, user?: AuthenticatedUserPayload): Promise<DeskDto> {
    const coordValidation = DeskPlacementPolicy.validateCoordinates(
      dto.xCoordinatePct,
      dto.yCoordinatePct
    );
    if (coordValidation.isFailure) {
      throw new BadRequestException(coordValidation.getError());
    }

    const codeValidation = DeskPlacementPolicy.validateDeskCode(dto.code);
    if (codeValidation.isFailure) {
      throw new BadRequestException(codeValidation.getError());
    }

    await this.assertFloorBuildingScope(user, dto.floorId);

    let targetPlanId = dto.floorPlanId;
    if (!targetPlanId) {
      const planRes = await this.databaseService.query(
        `SELECT id FROM floor_plans WHERE floor_id = $1 AND is_active = TRUE LIMIT 1`,
        [dto.floorId]
      );
      if (planRes.rows.length > 0) {
        targetPlanId = planRes.rows[0].id;
      }
    }

    if (!targetPlanId) {
      throw new BadRequestException('Cannot place a desk on a floor without an active floor plan. Please upload a floor plan to this floor first.');
    }

    try {
      const res = await this.databaseService.query(
        `INSERT INTO desks (floor_id, floor_plan_id, code, label, desk_type, x_coordinate_pct, y_coordinate_pct, amenities)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, floor_id, floor_plan_id, code, label, desk_type, x_coordinate_pct, y_coordinate_pct, is_active, needs_position_review, amenities`,
        [
          dto.floorId,
          targetPlanId,
          dto.code.trim().toUpperCase(),
          dto.label.trim(),
          dto.deskType || DeskType.STANDARD,
          dto.xCoordinatePct,
          dto.yCoordinatePct,
          JSON.stringify(dto.amenities || [])
        ]
      );

      const row = res.rows[0];
      return {
        id: row.id,
        floorId: row.floor_id,
        floorPlanId: row.floor_plan_id,
        code: row.code,
        label: row.label,
        deskType: row.desk_type as DeskType,
        xCoordinatePct: Number(row.x_coordinate_pct),
        yCoordinatePct: Number(row.y_coordinate_pct),
        isActive: row.is_active,
        needsPositionReview: row.needs_position_review,
        amenities: row.amenities || []
      };
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException(`A desk with code '${dto.code}' already exists on this floor plan.`);
      }
      throw err;
    }
  }

  public async updateDeskCoordinates(
    deskId: string,
    dto: UpdateDeskCoordinatesDto,
    user?: AuthenticatedUserPayload
  ): Promise<DeskDto> {
    const coordValidation = DeskPlacementPolicy.validateCoordinates(
      dto.xCoordinatePct,
      dto.yCoordinatePct
    );
    if (coordValidation.isFailure) {
      throw new BadRequestException(coordValidation.getError());
    }

    await this.assertDeskBuildingScope(user, deskId);

    const res = await this.databaseService.query(
      `UPDATE desks
       SET x_coordinate_pct = $1, y_coordinate_pct = $2
       WHERE id = $3 AND is_active = TRUE
       RETURNING id, floor_id, code, label, desk_type, x_coordinate_pct, y_coordinate_pct, is_active, needs_position_review, amenities`,
      [dto.xCoordinatePct, dto.yCoordinatePct, deskId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Desk not found');
    }

    const row = res.rows[0];
    return {
      id: row.id,
      floorId: row.floor_id,
      code: row.code,
      label: row.label,
      deskType: row.desk_type as DeskType,
      xCoordinatePct: Number(row.x_coordinate_pct),
      yCoordinatePct: Number(row.y_coordinate_pct),
      isActive: row.is_active,
      needsPositionReview: row.needs_position_review,
      amenities: row.amenities || []
    };
  }

  public async acknowledgeDeskReview(deskId: string, user?: AuthenticatedUserPayload): Promise<DeskDto> {
    await this.assertDeskBuildingScope(user, deskId);
    const res = await this.databaseService.query(
      `UPDATE desks
       SET needs_position_review = FALSE
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, floor_id, code, label, desk_type, x_coordinate_pct, y_coordinate_pct, is_active, needs_position_review, amenities`,
      [deskId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Desk not found');
    }

    const row = res.rows[0];
    return {
      id: row.id,
      floorId: row.floor_id,
      code: row.code,
      label: row.label,
      deskType: row.desk_type as DeskType,
      xCoordinatePct: Number(row.x_coordinate_pct),
      yCoordinatePct: Number(row.y_coordinate_pct),
      isActive: row.is_active,
      needsPositionReview: row.needs_position_review,
      amenities: row.amenities || []
    };
  }

  public async deleteDesk(deskId: string, user?: AuthenticatedUserPayload): Promise<void> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(deskId)) {
      return;
    }
    await this.assertDeskBuildingScope(user, deskId);
    await this.databaseService.query(
      `DELETE FROM desks WHERE id = $1`,
      [deskId]
    );
  }

  public async deleteFloor(floorId: string, user?: AuthenticatedUserPayload): Promise<void> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(floorId)) {
      throw new BadRequestException('Invalid floor ID format');
    }
    await this.assertFloorBuildingScope(user, floorId);
    const res = await this.databaseService.query(
      `DELETE FROM floors WHERE id = $1 RETURNING id`,
      [floorId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Floor not found');
    }
  }

  public async deleteBuilding(buildingId: string): Promise<void> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(buildingId)) {
      throw new BadRequestException('Invalid building ID format');
    }
    const res = await this.databaseService.query(
      `DELETE FROM buildings WHERE id = $1 RETURNING id`,
      [buildingId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Building not found');
    }
  }

  public async purgeDemoData(): Promise<{ clearedCount: number }> {
    const res = await this.databaseService.query(
      `DELETE FROM companies WHERE is_demo = TRUE`
    );
    await this.databaseService.query(
      `DELETE FROM users WHERE is_demo = TRUE AND is_recovery_admin = FALSE`
    );
    return { clearedCount: res.rowCount || 0 };
  }
}

