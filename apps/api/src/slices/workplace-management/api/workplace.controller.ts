import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {
  BuildingDto,
  FloorDto,
  FloorPlanDto,
  DeskDto,
  UserRole
} from '@seat-reservation/contracts';
import { WorkplaceManagementService } from '../workplace-management.service.js';
import { JwtAuthGuard } from '../../identity-access/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../identity-access/guards/roles.guard.js';
import { Roles } from '../../identity-access/decorators/roles.decorator.js';
import { CurrentUser, AuthenticatedUserPayload } from '../../identity-access/decorators/current-user.decorator.js';
import { CreateBuildingDto } from './dto/create-building.dto.js';
import { CreateFloorDto, CreateFloorBodyDto } from './dto/create-floor.dto.js';
import { UploadFloorPlanDto } from './dto/upload-floor-plan.dto.js';
import { CreateDeskDto } from './dto/create-desk.dto.js';
import { UpdateDeskCoordinatesDto } from './dto/update-desk-coordinates.dto.js';

@Controller('workplace')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkplaceController {
  constructor(private readonly workplaceService: WorkplaceManagementService) {}

  @Get('companies')
  async listCompanies(): Promise<{ id: string; name: string }[]> {
    return this.workplaceService.listCompanies();
  }

  @Post('companies')
  @Roles(UserRole.SYSTEM_ADMIN)
  async createCompany(@Body() dto: { name: string }): Promise<{ id: string; name: string }> {
    return this.workplaceService.createCompany(dto.name);
  }

  @Get('buildings')
  async listBuildings(@CurrentUser() user?: AuthenticatedUserPayload): Promise<BuildingDto[]> {
    return this.workplaceService.listBuildings(user);
  }

  @Post('buildings')
  @Roles(UserRole.SYSTEM_ADMIN)
  async createBuilding(@Body() dto: CreateBuildingDto): Promise<BuildingDto> {
    return this.workplaceService.createBuilding(dto);
  }

  @Delete('buildings/:buildingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SYSTEM_ADMIN)
  async deleteBuilding(@Param('buildingId') buildingId: string): Promise<void> {
    return this.workplaceService.deleteBuilding(buildingId);
  }

  @Get('buildings/:buildingId/floors')
  async listFloors(
    @Param('buildingId') buildingId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<FloorDto[]> {
    return this.workplaceService.listFloors(buildingId, user);
  }

  @Post('buildings/:buildingId/floors')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async createFloor(
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateFloorBodyDto,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<FloorDto> {
    return this.workplaceService.createFloor({
      ...dto,
      buildingId
    }, user);
  }

  @Delete('floors/:floorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async deleteFloor(
    @Param('floorId') floorId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<void> {
    return this.workplaceService.deleteFloor(floorId, user);
  }

  @Get('floors/:floorId/floor-plans')
  async listFloorPlans(
    @Param('floorId') floorId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<FloorPlanDto[]> {
    return this.workplaceService.listFloorPlans(floorId, user);
  }

  @Get('floor-plans/library')
  async listFloorPlanLibrary(): Promise<FloorPlanDto[]> {
    return this.workplaceService.listWorkplaceFloorPlanLibrary();
  }

  @Post('floors/:floorId/floor-plan')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async uploadFloorPlan(
    @Param('floorId') floorId: string,
    @Body() dto: UploadFloorPlanDto,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<FloorPlanDto> {
    return this.workplaceService.uploadOrReplaceFloorPlan(floorId, dto, user);
  }

  @Post('floors/:floorId/floor-plans/:planId/activate')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async activateFloorPlan(
    @Param('floorId') floorId: string,
    @Param('planId') planId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<FloorPlanDto> {
    return this.workplaceService.activateFloorPlan(floorId, planId, user);
  }

  @Delete('floors/:floorId/floor-plans/:planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async deleteFloorPlan(
    @Param('floorId') floorId: string,
    @Param('planId') planId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<void> {
    return this.workplaceService.deleteFloorPlan(floorId, planId, user);
  }

  @Get('floors/:floorId/desks')
  async listDesks(
    @Param('floorId') floorId: string,
    @Query('floorPlanId') floorPlanId?: string
  ): Promise<DeskDto[]> {
    return this.workplaceService.listDesksForFloor(floorId, floorPlanId);
  }

  @Post('floors/:floorId/desks')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async createDesk(
    @Param('floorId') floorId: string,
    @Body() dto: Omit<CreateDeskDto, 'floorId'>,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<DeskDto> {
    return this.workplaceService.createDesk({
      ...dto,
      floorId
    }, user);
  }

  @Patch('desks/:deskId/coordinates')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async updateDeskCoordinates(
    @Param('deskId') deskId: string,
    @Body() dto: UpdateDeskCoordinatesDto,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<DeskDto> {
    return this.workplaceService.updateDeskCoordinates(deskId, dto, user);
  }

  @Post('desks/:deskId/acknowledge-review')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async acknowledgeDeskReview(
    @Param('deskId') deskId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<DeskDto> {
    return this.workplaceService.acknowledgeDeskReview(deskId, user);
  }

  // Alias for backward compatibility
  @Post('desks/:deskId/review-ack')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async acknowledgeDeskReviewAlias(
    @Param('deskId') deskId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<DeskDto> {
    return this.workplaceService.acknowledgeDeskReview(deskId, user);
  }

  @Delete('desks/:deskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.BUILDING_MANAGER)
  async deleteDesk(
    @Param('deskId') deskId: string,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<void> {
    return this.workplaceService.deleteDesk(deskId, user);
  }

  @Post('purge-demo-data')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SYSTEM_ADMIN)
  async purgeDemoData(): Promise<{ clearedCount: number }> {
    return this.workplaceService.purgeDemoData();
  }
}

