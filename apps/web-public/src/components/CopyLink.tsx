'use client';
import { useState } from 'react';

export default function CopyLink() {
  const [t, setT] = useState('লিংক কপি করুন');
  return (
    <button type="button" className="btn btn-ghost" onClick={() => {
      try { navigator.clipboard.writeText(window.location.href).then(() => setT('লিংক কপি হয়েছে'), () => setT('কপি করা যায়নি')); } catch { setT('কপি করা যায়নি'); }
    }}><span aria-live="polite">{t}</span></button>
  );
}
