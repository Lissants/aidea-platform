// Superseded by lib/services/users.ts. The raw addUserRole/removeUserRole actions
// were removed because they let any admin grant any role (including developer),
// bypassing the tier rules in lib/permissions canManageUser(). Safe to delete.
export type { RoleName } from '@/types/database';
