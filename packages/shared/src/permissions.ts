/* Permission registry (docs/04-API.md §4). The API is authoritative; the admin UI only uses this to hide buttons. */

export const PERMS = [
  'dashboard.view',
  'posts.view', 'posts.create', 'posts.edit_any', 'posts.publish', 'posts.delete',
  'media.upload',
  'content.edit', 'content.publish',
  'profile.edit', 'profile.publish',
  'promises.edit',
  'site.edit', 'settings.edit',
  'team.manage',
  'complaints.view_all', 'complaints.view_scoped', 'complaints.note', 'complaints.manage',
  'complaints.create_staff', 'complaints.pii_view', 'complaints.export',
  'audit.view',
] as const;
export type Perm = (typeof PERMS)[number];

export const TENANT_ROLES = ['owner', 'editor', 'officer'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
/** Roles that exist inside a tenant panel, including the two platform roles that can act-as. */
export type PanelRole = TenantRole | 'super_admin' | 'support';
export const PLATFORM_ROLES = ['super_admin', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

const ALL_EXCEPT_PII = PERMS.filter((p) => p !== 'complaints.pii_view') as Perm[];

export const ROLE_PERMS: Record<PanelRole, readonly Perm[]> = {
  owner: ALL_EXCEPT_PII,
  editor: ['dashboard.view', 'posts.view', 'posts.create', 'media.upload', 'profile.edit', 'content.edit'],
  officer: ['dashboard.view', 'complaints.view_scoped', 'complaints.note', 'complaints.pii_view', 'complaints.create_staff'],
  // act-as super admin: everything an owner can, and never complainant PII
  super_admin: ALL_EXCEPT_PII,
  support: ['dashboard.view', 'posts.view', 'complaints.view_all', 'audit.view'],
};

/** Permissions nobody may be granted through per-membership overrides. */
export const NON_OVERRIDABLE: readonly Perm[] = ['complaints.pii_view'];

export function hasPermission(granted: readonly string[], perm: Perm): boolean {
  return granted.includes('*') || granted.includes(perm);
}

/** OR-semantics: true when the user holds ANY of the listed permissions. */
export function hasAnyPermission(granted: readonly string[], perms: readonly Perm[]): boolean {
  return perms.some((p) => hasPermission(granted, p));
}

export function permissionsFor(role: PanelRole, overrides?: readonly string[]): Perm[] {
  const base = [...ROLE_PERMS[role]];
  if (!overrides?.length) return base;
  const extra = overrides.filter((p): p is Perm => (PERMS as readonly string[]).includes(p) && !NON_OVERRIDABLE.includes(p as Perm));
  return [...new Set([...base, ...extra])];
}
