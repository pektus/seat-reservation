import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {
  SetupStatusResponse,
  DatabaseTestResultDto
} from '@seat-reservation/contracts';
import { SystemSetupService } from '../system-setup.service.js';
import { SetupLockGuard } from './guards/setup-lock.guard.js';
import { TestDatabaseDto } from './dto/test-database.dto.js';
import { InitializeSystemDto } from './dto/initialize-system.dto.js';

@Controller('setup')
export class SystemSetupController {
  constructor(private readonly setupService: SystemSetupService) {}

  @Get('status')
  async getStatus(): Promise<SetupStatusResponse> {
    return this.setupService.getStatus();
  }

  @Post('database/test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SetupLockGuard)
  async testDatabase(@Body() dto: TestDatabaseDto): Promise<DatabaseTestResultDto> {
    return this.setupService.testDatabase(dto);
  }

  @Post('initialize')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SetupLockGuard)
  async initializeSystem(@Body() dto: InitializeSystemDto): Promise<SetupStatusResponse> {
    return this.setupService.initializeSystem(dto);
  }
}

