import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Folder, Film, Clock } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  videoCount: number;
  createdAt: string;
  updatedAt: string;
  owner?: {
    name: string;
    email: string;
  };
}

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('vi-VN');
  };

  return (
    <Card hover onClick={onClick} className="group">
      <CardContent className="p-4">
        {/* Project Icon & Name */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-lg bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
            <Folder className="w-6 h-6 text-accent-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary truncate group-hover:text-accent-blue transition-colors">
              {project.name}
            </h3>
            {project.description && (
              <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Project Stats */}
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-1">
            <Film className="w-3 h-3" />
            <span>{project.videoCount} videos</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatDate(project.updatedAt)}</span>
          </div>
        </div>

        {/* Owner */}
        {project.owner && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <Avatar name={project.owner.name} size="sm" />
            <span className="text-xs text-text-secondary">{project.owner.name}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};