import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { UserRole, UserSummaryDto, UpdateUserRolesRequest } from '@seat-reservation/contracts';
import { IdentityAccessService } from '../identity-access.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { Roles } from '../decorators/roles.decorator.js';
import { CurrentUser, AuthenticatedUserPayload } from '../decorators/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: IdentityAccessService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedUserPayload): Promise<AuthenticatedUserPayload> {
    return user;
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  async listUsers(): Promise<UserSummaryDto[]> {
    return this.authService.listUsers();
  }

  @Put('users/:userId/roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  async updateUserRoles(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRolesRequest,
    @CurrentUser() admin: AuthenticatedUserPayload
  ): Promise<UserSummaryDto> {
    return this.authService.updateUserRoles(userId, dto, admin);
  }
}

