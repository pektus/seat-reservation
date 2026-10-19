import {
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsEmail,
  MinLength,
  IsEnum,
  IsOptional
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthProviderType, SetupInitialConfigRequest } from '@seat-reservation/contracts';
import { TestDatabaseDto } from './test-database.dto.js';

export class RecoveryAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @MinLength(12, { message: 'Master recovery password must be at least 12 characters long' })
  password!: string;
}

export class AuthProviderConfigDto {
  @IsEnum(AuthProviderType)
  type!: AuthProviderType;

  @IsString()
  @IsOptional()
  metadataUrl?: string;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  clientSecret?: string;
}

export class InitializeSystemDto implements SetupInitialConfigRequest {
  @ValidateNested()
  @Type(() => TestDatabaseDto)
  database!: TestDatabaseDto;

  @ValidateNested()
  @Type(() => RecoveryAdminDto)
  recoveryAdmin!: RecoveryAdminDto;

  @ValidateNested()
  @Type(() => AuthProviderConfigDto)
  authProvider!: AuthProviderConfigDto;

  @IsString()
  @IsNotEmpty()
  companyName!: string;
}

