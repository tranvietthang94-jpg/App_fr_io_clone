import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Folder, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { Project } from '@r-frame/shared';

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
  onDelete?: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick, onDelete }) => {
  return (
    <Card hover onClick={onClick} className="group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-lg bg-accent-blue/10 flex items-center justify-center">
            <Folder className="w-6 h-6 text-accent-blue" />
          </div>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Xóa dự án"
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 p-2 hover:bg-bg-tertiary rounded-md transition-opacity focus:outline-none focus:ring-2 focus:ring-accent-blue"
            >
              <Trash2 className="w-4 h-4 text-accent-red" />
            </button>
          )}
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-1 truncate">
          {project.name}
        </h3>
        {project.description && (
          <p className="text-sm text-text-secondary mb-4 line-clamp-2">
            {project.description}
          </p>
        )}
        <p className="text-xs text-text-muted">
          Cập nhật {formatRelativeTime(project.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
};
