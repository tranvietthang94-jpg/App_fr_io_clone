import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsUUID()
  parentFolderId?: string;
}

export class RenameFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;
}
