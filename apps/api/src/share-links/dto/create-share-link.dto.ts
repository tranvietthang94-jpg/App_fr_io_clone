import { IsEnum, IsOptional, IsISO8601, IsString, MinLength } from 'class-validator';
import { SharePermission } from '../share-link.entity';

export class CreateShareLinkDto {
  @IsOptional()
  @IsEnum(SharePermission)
  permission?: SharePermission;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;
}
