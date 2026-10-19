import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UseGuards,
  Req
} from '@nestjs/common';
import { SeedDemoDataResponse, ResetDemoDataResponse, UserRole } from '@seat-reservation/contracts';
import { DemoSeederService } from '../infrastructure/demo-seeder.service.js';
import { SetupLockManager } from '../../system-setup/infrastructure/setup-lock.manager.js';
import { OptionalJwtAuthGuard } from '../../identity-access/guards/optional-jwt-auth.guard.js';

@Controller('demo')
export class DemoSandboxController {
  constructor(
    private readonly seederService: DemoSeederService,
    private readonly lockManager: SetupLockManager
  ) {}

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  async seedDemoData(): Promise<SeedDemoDataResponse> {
    if (this.lockManager.isLocked()) {
      throw new ForbiddenException('Demo sandbox seeding is permanently disabled after system setup.');
    }
    return this.seederService.seedDemoData();
  }

  @Post('reset')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async resetDemoData(@Req() req?: any): Promise<ResetDemoDataResponse> {
    if (this.lockManager.isLocked()) {
      const user = req?.user;
      const isAdmin = user && (user.isRecoveryAdmin || user.roles?.includes(UserRole.SYSTEM_ADMIN));
      if (!isAdmin) {
        throw new ForbiddenException('Demo sandbox reset is restricted to system administrators once system setup is locked.');
      }
    }
    return this.seederService.resetDemoData();
  }
}

