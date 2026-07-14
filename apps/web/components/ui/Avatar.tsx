import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const avatarSize = cva('', {
  variants: {
    size: {
      sm: 'w-8 h-8 text-xs',
      md: 'w-10 h-10 text-sm',
      lg: 'w-12 h-12 text-base',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

interface AvatarProps extends VariantProps<typeof avatarSize> {
  src?: string;
  alt?: string;
  name?: string;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, name, size, className }) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (src) {
    return (
      <img
        src={src}
        alt={alt || name}
        className={cn('rounded-full object-cover', avatarSize({ size }), className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-accent-blue flex items-center justify-center text-white font-semibold',
        avatarSize({ size }),
        className
      )}
    >
      {name ? getInitials(name) : '?'}
    </div>
  );
};

interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  className?: string;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  children,
  max = 5,
  className,
}) => {
  const childArray = React.Children.toArray(children);
  const visibleChildren = childArray.slice(0, max);
  const remainingCount = childArray.length - max;

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visibleChildren.map((child, index) => (
        <div key={index} className="ring-2 ring-bg-primary rounded-full">
          {child}
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="w-10 h-10 rounded-full bg-bg-tertiary ring-2 ring-bg-primary flex items-center justify-center text-sm font-semibold text-text-secondary">
          +{remainingCount}
        </div>
      )}
    </div>
  );
};
