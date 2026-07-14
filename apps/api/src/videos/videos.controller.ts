import { Controller, Get, Delete, Post, Patch, Body, Param, Query, UseGuards, Res, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Response, Request } from 'express';
import { VideosService } from './videos.service';
import { MediaService } from '../media/media.service';
import { ProjectsService } from '../projects/projects.service';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto';
import { resolveStreamFilePath, streamVideoFile } from './stream-file.util';

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
  async findByProject(
    @Param('projectId') projectId: string,
    @Query('folderId') folderId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('reviewStatus') reviewStatus: string | undefined,
    @Req() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user.userId);
    return this.videosService.findByProject(projectId, folderId ?? null, { search, reviewStatus });
  }

  @Get('projects/:projectId/trash')
  @UseGuards(AuthGuard('jwt'))
  async findTrash(@Param('projectId') projectId: string, @Req() req: any) {
    await this.projectsService.findOne(projectId, req.user.userId);
    return this.videosService.findTrash(projectId);
  }

  @Get('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.videosService.findOwned(id, req.user.userId);
  }

  @Get('videos/:id/versions')
  @UseGuards(AuthGuard('jwt'))
  async getVersions(@Param('id') id: string, @Req() req: any) {
    const video = await this.videosService.findOwned(id, req.user.userId);
    return this.videosService.getVersions(video.assetGroupId, req.user.userId);
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

    const filePath = resolveStreamFilePath(video, quality);
    if (!filePath) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    streamVideoFile(filePath, req, res);
  }

  @Patch('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async rename(@Param('id') id: string, @Body() body: { title: string }, @Req() req: any) {
    return this.videosService.rename(id, body.title, req.user.userId);
  }

  @Patch('videos/:id/review-status')
  @UseGuards(AuthGuard('jwt'))
  async setReviewStatus(@Param('id') id: string, @Body() body: UpdateReviewStatusDto, @Req() req: any) {
    return this.videosService.setReviewStatus(id, body.status, req.user.userId, req.user.username || req.user.email);
  }

  @Patch('videos/:id/move')
  @UseGuards(AuthGuard('jwt'))
  async move(@Param('id') id: string, @Body() body: { folderId: string | null }, @Req() req: any) {
    return this.videosService.move(id, body.folderId, req.user.userId);
  }

  @Delete('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.videosService.softDelete(id, req.user.userId);
  }

  @Post('videos/:id/restore')
  @UseGuards(AuthGuard('jwt'))
  async restore(@Param('id') id: string, @Req() req: any) {
    return this.videosService.restore(id, req.user.userId);
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
