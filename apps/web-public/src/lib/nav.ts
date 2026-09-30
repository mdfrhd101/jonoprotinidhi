/* Site menu. Labels are generic UI copy; every MP-specific text comes from the CMS. */
export const NAV: ReadonlyArray<readonly [href: string, label: string]> = [
  ['/', 'হোম'],
  ['/about', 'পরিচিতি'],
  ['/activities', 'কার্যক্রম'],
  ['/promises', 'প্রতিশ্রুতি'],
  ['/area', 'নির্বাচনী এলাকা'],
  ['/gallery', 'গ্যালারি'],
  ['/videos', 'ভিডিও'],
  ['/contact', 'যোগাযোগ'],
];

/** Which menu entry is "current" for a path (/biography belongs to পরিচিতি, /activities/x to কার্যক্রম). */
export function activeNav(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return '/';
  if (p.startsWith('/biography')) return '/about';
  const hit = NAV.find(([h]) => h !== '/' && (p === h || p.startsWith(h + '/')));
  return hit ? hit[0] : p;
}

/** Generic page names, used as a heading when the CMS has no page title yet. */
export const PAGE_NAME: Record<string, string> = {
  about: 'পরিচিতি', biography: 'জীবনপঞ্জি', activities: 'কার্যক্রম', promises: 'প্রতিশ্রুতি', area: 'নির্বাচনী এলাকা',
  gallery: 'গ্যালারি', videos: 'ভিডিও', complaint: 'অভিযোগ বক্স', contact: 'যোগাযোগ',
};
