import { IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CopyVideoDto {
  @IsUUID()
  targetProjectId: string;

  // null = project root of the target project; a folder must belong to it (re-checked in the service).
  @ValidateIf((o) => o.targetFolderId !== null)
  @IsUUID()
  targetFolderId: string | null;
}

export class CopyFolderDto {
  @IsUUID()
  targetProjectId: string;

  @ValidateIf((o) => o.targetParentFolderId !== null)
  @IsUUID()
  targetParentFolderId: string | null;
}

export class PermanentDeleteDto {
  // Compared with the item's name in the service; no MinLength so an empty value gets the same 400.
  @IsString()
  @MaxLength(255)
  confirmName: string;
}
