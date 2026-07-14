import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';
import { InviteMemberDto, UpdateMemberRoleDto } from './dto/invite-member.dto';

@Controller('projects')
@UseGuards(AuthGuard('jwt'))
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  async findAll(@Request() req) {
    return this.projectsService.findAll(req.user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.projectsService.findOne(id, req.user.userId);
  }

  @Post()
  async create(@Body() body: { name: string; description?: string }, @Request() req) {
    return this.projectsService.create(body, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
    @Request() req,
  ) {
    return this.projectsService.update(id, body, req.user.userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.projectsService.delete(id, req.user.userId);
  }

  @Get(':id/members')
  async getMembers(@Param('id') id: string, @Request() req) {
    return this.projectsService.getMembers(id, req.user.userId);
  }

  @Post(':id/members/invite')
  async inviteMember(@Param('id') id: string, @Body() body: InviteMemberDto, @Request() req) {
    return this.projectsService.invite(id, req.user.userId, body);
  }

  @Patch(':id/members/:memberId')
  async updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRoleDto,
    @Request() req,
  ) {
    return this.projectsService.updateMemberRole(id, memberId, req.user.userId, body.role);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Request() req,
  ) {
    return this.projectsService.removeMember(id, memberId, req.user.userId);
  }
}
