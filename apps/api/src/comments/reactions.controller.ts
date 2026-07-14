import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReactionsService } from './reactions.service';
import { CommentsService } from './comments.service';
import { VideosService } from '../videos/videos.service';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';

@Controller('comments/:commentId/reactions')
@UseGuards(AuthGuard('jwt'))
export class ReactionsController {
  constructor(
    private reactionsService: ReactionsService,
    private commentsService: CommentsService,
    private videosService: VideosService,
  ) {}

  @Post()
  async toggle(
    @Param('commentId') commentId: string,
    @Body() body: ToggleReactionDto,
    @Request() req,
  ) {
    const comment = await this.commentsService.findOne(commentId);
    await this.videosService.findOwned(comment.videoId, req.user.userId);
    return this.reactionsService.toggle(commentId, req.user.userId, body.emoji, req.user.username || req.user.email);
  }

  @Get()
  async findByComment(@Param('commentId') commentId: string, @Request() req) {
    const comment = await this.commentsService.findOne(commentId);
    await this.videosService.findOwned(comment.videoId, req.user.userId);
    return this.reactionsService.findByComment(commentId);
  }
}
