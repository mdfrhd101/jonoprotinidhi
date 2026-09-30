import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui';

export function renderApp(ui: ReactElement, route = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[route]}><ToastProvider>{ui}</ToastProvider></MemoryRouter></QueryClientProvider>,
  );
}

/** A fake TenantApi where each verb is a vi.fn you can program per test. */
export function fakeTenantApi(routes: Record<string, unknown> = {}) {
  const pick = (verb: string) => vi.fn(async (path: string, body?: unknown) => {
    const k = `${verb} ${path.split('?')[0]}`;
    const v = routes[k] ?? routes[path.split('?')[0]!];
    if (typeof v === 'function') return (v as (b?: unknown) => unknown)(body);
    if (v instanceof Error) throw v;
    return v ?? {};
  });
  return { get: pick('GET'), post: pick('POST'), patch: pick('PATCH'), put: pick('PUT'), del: pick('DELETE'), blob: vi.fn(), upload: vi.fn(async (_p: string, _f: Blob): Promise<any> => ({})),
    uploadProgress: vi.fn(async (_p: string, _f: Blob, _on?: (l: number, t: number) => void, _s?: AbortSignal): Promise<any> => ({})) };
}

export type FakeTenant = { id: string; info: any; can: (p: string) => boolean; api: ReturnType<typeof fakeTenantApi> };
export function fakeTenant(role: 'owner' | 'editor' | 'officer', routes: Record<string, unknown> = {}, extra: Partial<FakeTenant['info']> = {}): FakeTenant {
  const perms: Record<string, string[]> = {
    owner: ['dashboard.view', 'posts.view', 'posts.create', 'posts.edit_any', 'posts.publish', 'posts.delete', 'media.upload', 'content.edit', 'content.publish', 'profile.edit', 'profile.publish', 'promises.edit', 'site.edit', 'settings.edit', 'team.manage', 'complaints.view_all', 'complaints.view_scoped', 'complaints.note', 'complaints.manage', 'complaints.export', 'audit.view'],
    editor: ['dashboard.view', 'posts.view', 'posts.create', 'media.upload', 'profile.edit', 'content.edit'],
    officer: ['dashboard.view', 'complaints.view_scoped', 'complaints.note', 'complaints.pii_view', 'complaints.create_staff'],
  };
  const p = perms[role]!;
  return { id: 'T1', info: { role, viaSuperAdmin: false, permissions: p, scope: [], tenant: { id: 'T1', slug: 'ndp3', mpName: 'ড. তাহমিনা নূর', status: 'live', settings: { otpRequired: false, slaDays: 7, complaintCategories: ['ক ক', 'খ খ'] } }, ...extra }, can: (x) => p.includes(x), api: fakeTenantApi(routes) };
}
