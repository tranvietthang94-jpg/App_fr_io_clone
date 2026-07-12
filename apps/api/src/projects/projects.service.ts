import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
  ) {}

  async findAll(userId: string) {
    return this.projectsRepository.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string) {
    const project = await this.projectsRepository.findOne({
      where: { id, ownerId: userId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async create(data: { name: string; description?: string }, userId: string) {
    const project = this.projectsRepository.create({
      ...data,
      ownerId: userId,
    });
    return this.projectsRepository.save(project);
  }

  async update(id: string, data: { name?: string; description?: string }, userId: string) {
    const project = await this.findOne(id, userId);
    Object.assign(project, data);
    return this.projectsRepository.save(project);
  }

  async delete(id: string, userId: string) {
    const project = await this.findOne(id, userId);
    await this.projectsRepository.remove(project);
    return { success: true };
  }
}