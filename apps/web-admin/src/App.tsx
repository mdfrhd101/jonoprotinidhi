import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './session';
import { TenantLayout } from './tenant';
import Login, { AcceptInvite } from './pages/Login';
import Switch from './pages/Switch';
import Dashboard from './pages/tenant/Dashboard';
import { PostsList, PostEditor, PostDetail, Approvals } from './pages/tenant/Posts';
import Complaints from './pages/tenant/Complaints';
import Promises from './pages/tenant/Promises';
import Site, { Settings } from './pages/tenant/Site';
import SitePages from './pages/tenant/content/SitePages';
import PageEditor from './pages/tenant/content/PageEditor';
import Gallery from './pages/tenant/content/Gallery';
import Videos from './pages/tenant/content/Videos';
import Events from './pages/tenant/content/Events';
import MediaLibrary from './pages/tenant/content/MediaLibrary';
import { Team, Audit } from './pages/tenant/Team';
import { SuperLayout, SuperDashboard, TenantsList, NewTenant, TenantDetail, SuperAudit, SuperDomains } from './pages/super/Super';
import { Loading } from './components/ui';
import { lazy, Suspense } from 'react';

/* Living style guide, development only (tree-shaken out of production builds). */
const Kit = import.meta.env.DEV ? lazy(() => import('./pages/Kit')) : null;

function Private({ children }: { children: JSX.Element }) {
  const { status } = useSession();
  const loc = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  const { status } = useSession();
  return (
    <Routes>
      <Route path="/login" element={status === 'authed' ? <Navigate to="/switch" replace /> : <Login />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      {Kit && <Route path="/_kit" element={<Suspense fallback={<Loading />}><Kit /></Suspense>} />}
      <Route path="/switch" element={<Private><Switch /></Private>} />
      <Route path="/super" element={<Private><SuperLayout /></Private>}>
        <Route index element={<SuperDashboard />} />
        <Route path="tenants" element={<TenantsList />} />
        <Route path="tenants/new" element={<NewTenant />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="domains" element={<SuperDomains />} />
        <Route path="audit" element={<SuperAudit />} />
      </Route>
      <Route path="/t/:tenantId" element={<Private><TenantLayout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="posts" element={<PostsList />} />
        <Route path="posts/new" element={<PostEditor />} />
        <Route path="posts/:postId" element={<PostDetail />} />
        <Route path="posts/:postId/edit" element={<PostEditor />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="complaints/*" element={<Complaints />} />
        <Route path="promises" element={<Promises />} />
        <Route path="site" element={<Site />} />
        <Route path="settings" element={<Settings />} />
        <Route path="site-pages" element={<SitePages />} />
        <Route path="site-pages/:key" element={<PageEditor />} />
        <Route path="gallery" element={<Gallery />} />
        <Route path="videos" element={<Videos />} />
        <Route path="events" element={<Events />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="team" element={<Team />} />
        <Route path="audit" element={<Audit />} />
      </Route>
      <Route path="*" element={<Navigate to="/switch" replace />} />
    </Routes>
  );
}
