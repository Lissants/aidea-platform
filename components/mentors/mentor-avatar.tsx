import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-xl',
} as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Circular mentor photo with an initials fallback when none is uploaded. */
export function MentorAvatar({
  name,
  photoUrl,
  size = 'sm',
  className,
}: {
  name: string;
  photoUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt={name} className="object-cover" />}
      <AvatarFallback className="text-[length:inherit]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
