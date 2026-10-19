import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional, IsBoolean } from 'class-validator';
import { DatabaseConnectionConfig } from '@seat-reservation/contracts';

export class TestDatabaseDto implements DatabaseConnectionConfig {
  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @IsNotEmpty()
  database!: string;

  @IsString()
  @IsNotEmpty()
  user!: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  ssl?: boolean;
}

