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
  XCircle,
  Minus,
  Circle,
  PencilLine,
  RotateCcw,
} from 'lucide-react';

/**
 * Fixed status vocabulary for the whole app. Every status badge anywhere in
 * the product must use one of these keys — do not invent new label strings
 * elsewhere; extend this file instead so icon/color mapping stays consistent.
 *
 * These are DISPLAY keys. Stored workflow values (types/database.ts) are
 * mapped onto them with the helpers below and are never changed here.
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
  'pass',
  'not_pass',
  'not_applicable',
  'winner',
  'no_winner',
  'grand_winner',
  'runner_up',
  // Mentor review queue
  'not_started',
  'review_draft',
  'reopened',
  // Derived idea stage (lib/ideas/stage.ts)
  'screened_pass',
  'screened_fail',
  'qualified_build',
  'qualified_no_build',
] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];

export type StatusTone = 'neutral' | 'information' | 'warning' | 'success' | 'destructive';

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  tone: StatusTone;
  /** Rendered as plain muted text rather than a badge (absence of a result, not a state). */
  quiet?: boolean;
}

export const STATUS_META: Record<StatusKey, StatusMeta> = {
  draft: { label: 'Draft', icon: FileEdit, tone: 'neutral' },
  submitted: { label: 'Submitted', icon: Send, tone: 'information' },
  waiting_for_review: { label: 'Waiting for review', icon: Clock, tone: 'warning' },
  review_completed: { label: 'Review completed', icon: CheckCircle2, tone: 'success' },
  routing_required: { label: 'Routing required', icon: GitBranch, tone: 'warning' },
  awaiting_publication: { label: 'Awaiting publication', icon: Hourglass, tone: 'warning' },
  published: { label: 'Published', icon: Rocket, tone: 'success' },
  waiting_assignment: { label: 'Waiting assignment', icon: UserPlus, tone: 'warning' },
  assigned: { label: 'Assigned', icon: UserCheck, tone: 'information' },
  voting_scheduled: { label: 'Voting scheduled', icon: CalendarClock, tone: 'information' },
  voting_open: { label: 'Voting open', icon: Vote, tone: 'success' },
  voting_closed: { label: 'Voting closed', icon: Lock, tone: 'neutral' },
  build: { label: 'Build', icon: Hammer, tone: 'success' },
  no_build: { label: 'Not build', icon: Ban, tone: 'destructive' },
  pass: { label: 'Pass', icon: CheckCircle2, tone: 'success' },
  not_pass: { label: 'Not pass', icon: XCircle, tone: 'destructive' },
  not_applicable: { label: 'N/A', icon: Minus, tone: 'neutral', quiet: true },
  winner: { label: 'Winner', icon: Trophy, tone: 'success' },
  no_winner: { label: 'No winner', icon: Ban, tone: 'neutral' },
  grand_winner: { label: 'Grand winner', icon: Award, tone: 'success' },
  runner_up: { label: 'Runner-up', icon: Medal, tone: 'information' },
  not_started: { label: 'Not started', icon: Circle, tone: 'neutral' },
  review_draft: { label: 'In progress', icon: PencilLine, tone: 'information' },
  reopened: { label: 'Reopened', icon: RotateCcw, tone: 'warning' },
  screened_pass: { label: 'Passed screening', icon: CheckCircle2, tone: 'success' },
  screened_fail: { label: 'Not passed screening', icon: XCircle, tone: 'destructive' },
  qualified_build: { label: 'Qualified to build', icon: Hammer, tone: 'success' },
  qualified_no_build: { label: 'Not qualified to build', icon: Ban, tone: 'destructive' },
};

/** Mentor review-queue state (lib/services/my-reviews.ts) -> display key. */
export function reviewStatusKey(status: 'not_started' | 'draft' | 'submitted' | 'reopened'): StatusKey {
  return status === 'draft' ? 'review_draft' : status === 'submitted' ? 'review_completed' : status;
}

/** Stored review row status (reviews.status, typed loosely by some services) -> display key. */
export function reviewRowStatusKey(status: string): StatusKey {
  return status === 'draft' || status === 'submitted' || status === 'reopened' ? reviewStatusKey(status) : 'not_started';
}

/** Derived idea stage (lib/ideas/stage.ts) -> display key. */
export function stageStatusKey(
  stage: 'draft' | 'submitted' | 'screened_pass' | 'screened_fail' | 'build' | 'no_build'
): StatusKey {
  // build / no_build here are idea stages, not the bare qualifier result.
  return stage === 'build' ? 'qualified_build' : stage === 'no_build' ? 'qualified_no_build' : stage;
}
