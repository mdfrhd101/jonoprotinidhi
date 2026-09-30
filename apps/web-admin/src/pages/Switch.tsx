import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../session';
import { ROLE_LABEL } from '../format';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/primitives';

/* After login: platform staff go to /super, a person with one tenant goes straight in, several tenants -> chooser. */
export default function Switch() {
  const { me } = useSession();
  if (!me) return null;
  const staff = !!me.user.platformRole;
  const ms = me.memberships;
  if (!staff && ms.length === 1) return <Navigate to={`/t/${ms[0]!.tenantId}`} replace />;
  if (staff && ms.length === 0) return <Navigate to="/super" replace />;
  return (
    <div className="entry">
      <div className="in">
        <div className="auth-logo" style={{ marginBottom: 28 }}><BrandMark /><div><small>জনসেতু</small><b>অ্যাডমিন</b></div></div>
        <h1>কোন প্যানেলে ঢুকবেন?</h1>
        <div className="doors" style={{ marginTop: 24 }}>
          {staff && <Link className="door" to="/super"><small>প্ল্যাটফর্ম</small><b>{ROLE_LABEL[me.user.platformRole!]} প্যানেল</b><p>সব MP-র সাইট, ডোমেইন, অডিট।</p><span className="go">ঢুকুন<Icon name="arrowRight" /></span></Link>}
          {ms.map((m) => (
            <Link className="door" key={m.tenantId} to={`/t/${m.tenantId}`}>
              <small>{ROLE_LABEL[m.role]}</small><b>{m.mpName}</b><p>{m.seat}</p><span className="go">ঢুকুন<Icon name="arrowRight" /></span>
            </Link>
          ))}
        </div>
        {!staff && ms.length === 0 && <p className="lead">এই অ্যাকাউন্টে এখনো কোনো সাইটের অ্যাক্সেস নেই। আপনার অফিসের মালিককে জানান।</p>}
      </div>
    </div>
  );
}
