import { IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class RenameVideoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;
}

export class MoveVideoDto {
  // null moves the video back to the project root; a string must be a valid
  // folder id (ownership/project match is re-checked in the service).
  @ValidateIf((o) => o.folderId !== null)
  @IsUUID()
  folderId: string | null;

  // Present and different from the video's project = cross-project move (every version of the asset).
  // With it, folderId must be a folder of that target project.
  @IsOptional()
  @IsUUID()
  targetProjectId?: string;
}
