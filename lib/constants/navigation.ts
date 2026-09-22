import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Lightbulb,
  PlusCircle,
  Images,
  Vote,
  Trophy,
  Bell,
  ClipboardList,
  ClipboardCheck,
  Settings2,
  Users,
  Gavel,
  FileCheck2,
  UserCog,
  Presentation,
  GalleryHorizontalEnd,
  BarChart3,
  ScrollText,
  Shield,
  User,
  Home,
} from 'lucide-react';

export type AppRole = 'participant' | 'mentor' | 'admin' | 'employee_voter';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom nav (max 5 across desktop+mobile combined config). */
  mobilePrimary?: boolean;
  /** Shown inside the mobile "More" sheet instead of the bottom nav. */
  mobileMore?: boolean;
}

/**
 * Single source of truth for nav items per role. AppShell derives BOTH the
 * desktop sidebar list and the mobile bottom-nav + "More" sheet from this,
 * so the two surfaces can never drift out of sync.
 */
export const NAVIGATION: Record<AppRole, NavItem[]> = {
  participant: [
    { label: 'Overview', href: '/overview', icon: Home, mobilePrimary: true },
    { label: 'My Ideas', href: '/my-ideas', icon: Lightbulb, mobilePrimary: true },
    { label: 'Submit New Idea', href: '/submit', icon: PlusCircle, mobilePrimary: true },
    { label: 'Project Showcase', href: '/showcase', icon: Images, mobilePrimary: true },
    { label: 'Voting', href: '/voting', icon: Vote, mobileMore: true },
    { label: 'Results', href: '/results', icon: Trophy, mobileMore: true },
    { label: 'Notifications', href: '/notifications', icon: Bell, mobileMore: true },
  ],
  mentor: [
    { label: 'Overview', href: '/overview', icon: Home, mobilePrimary: true },
    { label: 'Idea Dashboard', href: '/dashboard', icon: LayoutDashboard, mobilePrimary: true },
    { label: 'My Reviews', href: '/reviews', icon: ClipboardCheck, mobilePrimary: true },
    { label: 'Project Showcase', href: '/showcase', icon: Images, mobilePrimary: true },
    { label: 'Results', href: '/results', icon: Trophy, mobileMore: true },
    { label: 'Notifications', href: '/notifications', icon: Bell, mobileMore: true },
  ],
  admin: [
    { label: 'Overview', href: '/overview', icon: Home, mobilePrimary: true },
    { label: 'Program', href: '/program', icon: Settings2, mobileMore: true },
    { label: 'Idea Management', href: '/ideas', icon: Lightbulb, mobilePrimary: true },
    { label: 'Review Assignment', href: '/review-assignment', icon: ClipboardList, mobileMore: true },
    { label: 'Screening Decision', href: '/screening', icon: Gavel, mobilePrimary: true },
    { label: 'Idea Qualifier', href: '/qualifier', icon: FileCheck2, mobileMore: true },
    { label: 'Project Mentor', href: '/project-mentor', icon: UserCog, mobileMore: true },
    { label: 'Final Presentation', href: '/final-presentation', icon: Presentation, mobileMore: true },
    { label: 'Showcase Content', href: '/showcase-content', icon: GalleryHorizontalEnd, mobileMore: true },
    { label: 'Voting Management', href: '/voting-management', icon: Vote, mobileMore: true },
    { label: 'Mentor Directory', href: '/mentors', icon: Users, mobileMore: true },
    { label: 'Notifications', href: '/notifications', icon: Bell, mobileMore: true },
    { label: 'Reports & Audit', href: '/reports', icon: BarChart3, mobilePrimary: true },
    { label: 'Settings', href: '/settings', icon: ScrollText, mobileMore: true },
  ],
  employee_voter: [
    { label: 'Showcase', href: '/showcase', icon: Images, mobilePrimary: true },
    { label: 'Voting', href: '/voting', icon: Vote, mobilePrimary: true },
    { label: 'Results', href: '/results', icon: Trophy, mobilePrimary: true },
    { label: 'Notifications', href: '/notifications', icon: Bell, mobilePrimary: true },
  ],
};

/** Route-group prefix each role's pages live under. */
export const ROLE_BASE_PATH: Record<AppRole, string> = {
  participant: '',
  mentor: '',
  admin: '',
  employee_voter: '',
};

/** Extra items always available via avatar/profile menu, not role nav. */
export const PROFILE_MENU_ITEMS: NavItem[] = [
  { label: 'Profile', href: '/profile', icon: User },
  { label: 'Admin Audit', href: '/audit', icon: Shield },
];

/** Highest-privilege-first ordering used to pick the default "acting as" role. */
export const ROLE_PRIORITY: AppRole[] = ['admin', 'mentor', 'participant', 'employee_voter'];

export function getDefaultRole(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return roles[0] ?? null;
}
