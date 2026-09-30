import type { LucideIcon } from 'lucide-react';
import {
  FileEdit,
  Send,
  Clock,
  CheckCircle2,
  GitBranch,
  Hourglass,
  Rocket,
  UserPlus,
  UserCheck,
  CalendarClock,
  Vote,
  Lock,
  Hammer,
  Ban,
  Trophy,
  Award,
  Medal,
} from 'lucide-react';

/**
 * Fixed status vocabulary for the whole app. Every status badge anywhere in
 * the product must use one of these keys — do not invent new label strings
 * elsewhere; extend this file instead so icon/color mapping stays consistent.
 */
export const STATUS_KEYS = [
  'draft',
  'submitted',
  'waiting_for_review',
  'review_completed',
  'routing_required',
  'awaiting_publication',
  'published',
  'waiting_assignment',
  'assigned',
  'voting_scheduled',
  'voting_open',
  'voting_closed',
  'build',
  'no_build',
  'winner',
  'no_winner',
  'grand_winner',
  'runner_up',
] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];

export type StatusTone = 'neutral' | 'information' | 'warning' | 'success' | 'destructive';

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  tone: StatusTone;
}

export const STATUS_META: Record<StatusKey, StatusMeta> = {
  draft: { label: 'Draft', icon: FileEdit, tone: 'neutral' },
  submitted: { label: 'Submitted', icon: Send, tone: 'information' },
  waiting_for_review: { label: 'Waiting for Review', icon: Clock, tone: 'warning' },
  review_completed: { label: 'Review Completed', icon: CheckCircle2, tone: 'success' },
  routing_required: { label: 'Routing Required', icon: GitBranch, tone: 'warning' },
  awaiting_publication: { label: 'Awaiting Publication', icon: Hourglass, tone: 'warning' },
  published: { label: 'Published', icon: Rocket, tone: 'success' },
  waiting_assignment: { label: 'Waiting Assignment', icon: UserPlus, tone: 'warning' },
  assigned: { label: 'Assigned', icon: UserCheck, tone: 'information' },
  voting_scheduled: { label: 'Voting Scheduled', icon: CalendarClock, tone: 'information' },
  voting_open: { label: 'Voting Open', icon: Vote, tone: 'success' },
  voting_closed: { label: 'Voting Closed', icon: Lock, tone: 'neutral' },
  build: { label: 'Build', icon: Hammer, tone: 'success' },
  no_build: { label: 'No Build', icon: Ban, tone: 'destructive' },
  winner: { label: 'Winner', icon: Trophy, tone: 'success' },
  no_winner: { label: 'No Winner', icon: Ban, tone: 'neutral' },
  grand_winner: { label: 'Grand Winner', icon: Award, tone: 'success' },
  runner_up: { label: 'Runner-Up', icon: Medal, tone: 'information' },
};
