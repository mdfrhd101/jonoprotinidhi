'use client';
import { useEffect, useRef, useState } from 'react';
import { safeMediaUrl } from '@/lib/links';

type Props = { src: string | null | undefined; alt?: string; className?: string; eager?: boolean; width?: number; height?: number; label?: string; onClick?: () => void };

/** <img> that becomes the neutral placeholder when the URL is empty or the image fails to load. */
export default function SafeImg({ src, alt = '', className, eager, width, height, label, onClick }: Props) {
  const url = safeMediaUrl(src);
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setBroken(false);
    // an image that failed before hydration never fires onError for React: check it once here
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) setBroken(true);
  }, [url]);
  if (!url || broken) return <span className={`noimg${className ? ' ' + className : ''}`} {...(label ? { role: 'img', 'aria-label': label } : {})} />;
  const prio = eager ? { fetchPriority: 'high' as const } : {};
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={url} alt={alt} className={className} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async"
      {...prio} draggable={false} onError={() => setBroken(true)} onClick={onClick} />
  );
}
