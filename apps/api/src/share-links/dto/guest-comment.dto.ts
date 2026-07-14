import { IsEmail, IsNumber, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class GuestCommentDto {
  @IsString()
  @MinLength(1)
  guestName: string;

  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsNumber()
  timestamp: number;

  @IsNumber()
  frameNumber: number;

  @IsOptional()
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @IsNumber()
  positionY?: number;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class GuestCommentEditDto {
  @IsString()
  editToken: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;
}

export class GuestCommentDeleteDto {
  @IsString()
  editToken: string;
}
