import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Request,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { UploadService } from './upload.service';
import { InitUploadDto } from './dto/init-upload.dto';

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

// Slightly above UPLOAD_CHUNK_SIZE to absorb multipart framing overhead — a
// body larger than that can only be an abuse attempt (memory/disk exhaustion).
const CHUNK_SIZE_LIMIT = parseEnvInt(process.env.UPLOAD_CHUNK_SIZE, 5 * 1024 * 1024) + 1024 * 1024;

@Controller('upload')
@UseGuards(AuthGuard('jwt'))
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('init')
  async initUpload(
    @Body() body: InitUploadDto,
    @Request() req,
  ) {
    return this.uploadService.initUpload(
      body.projectId,
      body.filename,
      body.fileSize,
      body.mimeType,
      req.user.userId,
      body.assetGroupId,
      body.folderId,
    );
  }

  @Get(':uploadId/status')
  async getStatus(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Request() req,
  ) {
    return this.uploadService.getUploadStatus(uploadId, req.user.userId);
  }

  @Post('chunk/:uploadId/:chunkIndex')
  @UseInterceptors(FileInterceptor('chunk', { limits: { fileSize: CHUNK_SIZE_LIMIT } }))
  async uploadChunk(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('chunkIndex') chunkIndex: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('Thiếu file chunk');
    }
    return this.uploadService.uploadChunk(
      uploadId,
      parseInt(chunkIndex as unknown as string, 10),
      file.buffer,
      req.user.userId,
    );
  }

  @Post('complete/:uploadId')
  async completeUpload(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Request() req,
  ) {
    return this.uploadService.completeUpload(uploadId, req.user.userId, req.user.username || req.user.email);
  }
}
