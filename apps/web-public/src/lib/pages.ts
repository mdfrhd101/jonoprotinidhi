/* Page data defaults (pure, unit-tested). */
import { PAGE_SCHEMAS } from '@jonoshetu/shared';
import type { PageKey, LayoutPage, HomePage, ProfilePage, HeroesPage, AreaPage, ContactPage, ComplaintPage } from './types';

export type PageMap = { layout: LayoutPage; home: HomePage; profile: ProfilePage; heroes: HeroesPage; area: AreaPage; contact: ContactPage; complaint: ComplaintPage };

/** Page data, always fully defaulted: even an unpublished page (or a field the API does not know yet) renders. */
export function defaultedPage<K extends PageKey>(key: K, data: unknown): PageMap[K] {
  const schema = PAGE_SCHEMAS[key];
  const ok = schema.safeParse(data ?? {});
  if (ok.success) return ok.data as PageMap[K];
  const base = schema.parse({}) as Record<string, unknown>;
  const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  // keep the known keys whose value has the same basic type as the default, drop the rest
  for (const [k, v] of Object.entries(raw)) if (k in base && typeof v === typeof base[k] && Array.isArray(v) === Array.isArray(base[k])) base[k] = v;
  return base as PageMap[K];
}

