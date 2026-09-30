import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/* CopyButton: copies a value to the clipboard and confirms it in place ("কপি হয়েছে") plus a polite live-region message.
   Works without the async Clipboard API (http:// dev hosts, old WebViews) through a hidden textarea + execCommand. */

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = value; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  } catch { return false; }
}

/** `<CopyButton value={token} label="আমন্ত্রণ লিংক কপি করুন" />`. `label` is the accessible name (and the visible text unless `iconOnly`). */
export function CopyButton({ value, label = 'কপি করুন', iconOnly, size = 'sm', className }: { value: string; label?: string; iconOnly?: boolean; size?: 'sm' | 'md'; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = async () => {
    const ok = await copyText(value);
    setState(ok ? 'ok' : 'fail');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2200);
  };
  const text = state === 'ok' ? 'কপি হয়েছে' : state === 'fail' ? 'কপি হয়নি' : label;
  return (
    <>
      <button type="button" className={`btn btn-g${size === 'sm' ? ' btn-s' : ''} copy-btn${state === 'ok' ? ' is-ok' : ''}${className ? ` ${className}` : ''}`} onClick={click} aria-label={label} title={label}>
        <Icon name={state === 'ok' ? 'check' : 'copy'} size={16} />
        {!iconOnly && <span aria-hidden>{text}</span>}
      </button>
      <span className="sr" role="status" aria-live="polite">{state === 'ok' ? 'কপি হয়েছে' : state === 'fail' ? 'কপি করা যায়নি, নিজে সিলেক্ট করে কপি করুন' : ''}</span>
    </>
  );
}
