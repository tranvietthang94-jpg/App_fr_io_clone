import { IsIn, IsObject } from 'class-validator';

export class CreateAnnotationDto {
  @IsIn(['draw', 'highlight', 'text', 'rectangle'])
  type: string;

  @IsObject()
  data: Record<string, unknown>;
}
