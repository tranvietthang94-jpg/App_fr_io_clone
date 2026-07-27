import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(5000)
  content: string;

  @IsNumber()
  @Min(0)
  timestamp: number;

  @IsInt()
  @Min(0)
  frameNumber: number;

  // Normalized 0..1 canvas coordinates of the pin, when the comment is placed
  // on a specific point of the frame.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  positionX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  positionY?: number;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;
}

export class SetResolvedDto {
  @IsBoolean()
  resolved: boolean;
}
