import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { papi, setActAs } from '../../api';
import { ReasonDialog } from '../../components';

/* Act-as (FR-SA-05): a 30-minute, session-bound token for ONE tenant, only after a written reason (audited as
   tenant.act_as). The labels are stable on purpose: e2e/smoke.py looks for "কী কারণে ঢুকছেন (অডিট লগে যাবে)" and "ঢুকুন". */

export function ActAsDialog({ tenant, open, onClose }: { tenant: { id: string; mpName: string } | null; open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <ReasonDialog title="সাইটের অ্যাডমিনে ঢুকুন" open={open && !!tenant} onClose={onClose} min={10} label="কী কারণে ঢুকছেন (অডিট লগে যাবে)" confirmLabel="ঢুকুন"
      onConfirm={async (reason) => {
        const r = await papi.post<{ actAsToken: string; expiresAt: string }>(`/super/tenants/${tenant!.id}/act-as`, { reason });
        setActAs({ tenantId: tenant!.id, token: r.actAsToken, expiresAt: new Date(r.expiresAt).getTime() });
        qc.removeQueries({ queryKey: ['tenant', tenant!.id] }); // never reuse cached data from another identity
        nav(`/t/${tenant!.id}`);
      }}>
      <div className="note sa-actas-note">
        <p style={{ margin: 0 }}><b>{tenant?.mpName}</b>-এর সাইটের অ্যাডমিন হিসেবে ৩০ মিনিট কাজ করতে পারবেন। প্রতিটি কাজ অডিট লগে "Super Admin" নামে থাকবে এবং MP অফিসও তা দেখতে পাবে।</p>
        <ul className="sa-actas-list">
          <li>নাগরিকের নাম-নম্বর এখানেও দেখা যাবে না।</li>
          <li>কারণ কমপক্ষে ১০ অক্ষরে লিখুন, যেমন "ব্যানারের ছবি ভাঙা, ঠিক করছি"।</li>
        </ul>
      </div>
    </ReasonDialog>
  );
}
