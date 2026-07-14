import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
