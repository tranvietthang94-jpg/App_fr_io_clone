import { Controller, Get, Delete, Post, Param, Query, UseGuards, Res, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { VideosService } from './videos.service';
import { MediaService } from '../media/media.service';
import { ProjectsService } from '../projects/projects.service';

@Controller()
export class VideosController {
  constructor(
    private videosService: VideosService,
    private mediaService: MediaService,
    private projectsService: ProjectsService,
    private jwtService: JwtService,
  ) {}

  @Get('projects/:projectId/videos')
  @UseGuards(AuthGuard('jwt'))
  async findByProject(@Param('projectId') projectId: string, @Req() req: any) {
    await this.projectsService.findOne(projectId, req.user.userId);
    return this.videosService.findByProject(projectId);
  }

  @Get('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.videosService.findOwned(id, req.user.userId);
  }

  @Get('videos/:id/stream/:quality')
  async stream(
    @Param('id') id: string,
    @Param('quality') quality: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // <video src> can't set an Authorization header, so this route accepts
    // the JWT as a query param instead of relying on the AuthGuard.
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let userId: string;
    try {
      userId = this.jwtService.verify(token).sub;
      if (!userId) throw new Error('Token missing sub claim');
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let video;
    try {
      video = await this.videosService.findOwned(id, userId);
    } catch {
      return res.status(404).json({ error: 'Video not found' });
    }

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
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.videosService.findOwned(id, req.user.userId);
    return this.videosService.delete(id);
  }

  @Post('videos/:id/transcode')
  @UseGuards(AuthGuard('jwt'))
  async transcode(@Param('id') id: string, @Req() req: any) {
    const video = await this.videosService.findOwned(id, req.user.userId);
    // Trigger transcode async
    this.mediaService.transcodeVideo(id, video.filePath).catch(err => {
      console.error('Transcode failed:', err);
    });
    return { message: 'Transcode started', videoId: id };
  }
}

