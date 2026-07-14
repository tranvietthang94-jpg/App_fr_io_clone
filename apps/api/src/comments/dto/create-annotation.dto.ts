import { IsIn, IsObject, IsOptional } from 'class-validator';

const ANNOTATION_TYPES = ['draw', 'highlight', 'text', 'rectangle'];

export class CreateAnnotationDto {
  @IsIn(ANNOTATION_TYPES)
  type: string;

  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateAnnotationDto {
  @IsOptional()
  @IsIn(ANNOTATION_TYPES)
  type?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
