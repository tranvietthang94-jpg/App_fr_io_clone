import { Controller, Post, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';

@Controller('invites')
@UseGuards(AuthGuard('jwt'))
export class InvitesController {
  constructor(private projectsService: ProjectsService) {}

  @Post(':token/accept')
  async accept(@Param('token') token: string, @Request() req) {
    return this.projectsService.acceptInvite(token, req.user.userId, req.user.email);
  }
}
