import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

export class UploadFloorPlanDto {
  @IsString()
  @IsNotEmpty()
  filePath!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(100)
  @IsOptional()
  widthPx?: number;

  @IsInt()
  @Min(100)
  @IsOptional()
  heightPx?: number;
}

