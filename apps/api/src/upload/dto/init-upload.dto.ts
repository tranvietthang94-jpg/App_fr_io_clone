import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class InitUploadDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(500)
  filename: string;

  @IsInt()
  @Min(1)
  fileSize: number;

  @IsString()
  @MaxLength(255)
  mimeType: string;

  // Present only for "upload a new version of this asset" — ties the new video
  // to an existing asset group.
  @IsOptional()
  @IsUUID()
  assetGroupId?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}
