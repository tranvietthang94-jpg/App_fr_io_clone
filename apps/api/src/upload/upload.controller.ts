import {
  Controller,
  Post,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { UploadService } from './upload.service';

@Controller('upload')
@UseGuards(AuthGuard('jwt'))
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('init')
  async initUpload(
    @Body() body: { projectId: string; filename: string; fileSize: number; mimeType: string },
  ) {
    return this.uploadService.initUpload(
      body.projectId,
      body.filename,
      body.fileSize,
      body.mimeType,
    );
  }

  @Post('chunk/:uploadId/:chunkIndex')
  @UseInterceptors(FileInterceptor('chunk'))
  async uploadChunk(
    @Param('uploadId') uploadId: string,
    @Param('chunkIndex') chunkIndex: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadService.uploadChunk(uploadId, parseInt(chunkIndex as unknown as string), file.buffer);
  }

  @Post('complete/:uploadId')
  async completeUpload(@Param('uploadId') uploadId: string) {
    return this.uploadService.completeUpload(uploadId);
  }
}