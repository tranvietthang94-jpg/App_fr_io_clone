import { Controller, Get, Delete, Post, Param, UseGuards, Res, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { VideosService } from './videos.service';
import { MediaService } from '../media/media.service';

@Controller()
export class VideosController {
  constructor(
    private videosService: VideosService,
    private mediaService: MediaService,
  ) {}

  @Get('projects/:projectId/videos')
  @UseGuards(AuthGuard('jwt'))
  async findByProject(@Param('projectId') projectId: string) {
    return this.videosService.findByProject(projectId);
  }

  @Get('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(@Param('id') id: string) {
    return this.videosService.findOne(id);
  }

  @Get('videos/:id/stream/:quality')
  async stream(
    @Param('id') id: string,
    @Param('quality') quality: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const video = await this.videosService.findOne(id);
    
    // Determine file path based on quality
    let filePath: string;
    if (quality === 'original') {
      filePath = video.filePath;
    } else {
      filePath = path.join(
        process.cwd(),
        'uploads',
        'transcoded',
        id,
        `${quality}.mp4`,
      );
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Fallback to original file
      filePath = video.filePath;
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Partial content response (for seeking)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Full content response
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, head);
      const file = fs.createReadStream(filePath);
      file.pipe(res);
    }
  }

  @Delete('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') id: string) {
    return this.videosService.delete(id);
  }

  @Post('videos/:id/transcode')
  @UseGuards(AuthGuard('jwt'))
  async transcode(@Param('id') id: string) {
    const video = await this.videosService.findOne(id);
    // Trigger transcode async
    this.mediaService.transcodeVideo(id, video.filePath).catch(err => {
      console.error('Transcode failed:', err);
    });
    return { message: 'Transcode started', videoId: id };
  }
}

