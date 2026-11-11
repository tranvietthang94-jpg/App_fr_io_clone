import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdatePermissionsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  permissions: string[];
}
