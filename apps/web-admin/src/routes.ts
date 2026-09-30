/* Which tenant-panel pages exist yet (paths are relative to /t/:tenantId). The dashboard's "site readiness" checklist and quick
   actions link to editors; a link whose path is not listed here is shown greyed out as "শীঘ্রই" instead of leading to a 404.

   WHEN YOU ADD A PAGE: 1) add the <Route> in App.tsx, 2) add the nav entry in tenant.tsx (TENANT_NAV), 3) add the path here. */
export const KNOWN_TENANT_ROUTES: readonly string[] = [
  '', 'posts', 'posts/new', 'approvals', 'complaints', 'promises', 'site', 'settings', 'team', 'audit',
  'gallery', 'videos', 'events', 'media', 'site-pages',
  'site-pages/home', 'site-pages/profile', 'site-pages/area', 'site-pages/contact', 'site-pages/complaint', 'site-pages/layout', 'site-pages/heroes',
];

export const routeExists = (path: string): boolean => KNOWN_TENANT_ROUTES.includes(path.replace(/^\/+|\/+$/g, ''));

/** Where each part of the site is edited (used by the dashboard checklist). Change a path here if an editor lives elsewhere. */
export const EDITOR_ROUTE: Record<string, string> = {
  layout: 'site-pages/layout', home: 'site-pages/home', profile: 'site-pages/profile', heroes: 'site-pages/heroes', area: 'site-pages/area',
  contact: 'site-pages/contact', complaint: 'site-pages/complaint',
  posts: 'posts/new', promises: 'promises', gallery: 'gallery', videos: 'videos', events: 'events', banners: 'site', media: 'media', pages: 'site-pages',
};
