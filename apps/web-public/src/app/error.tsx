'use client';
import Link from 'next/link';

/* Shown when the API cannot be reached or the page data failed to load. Never leaks technical details. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="state dark">
      <div>
        <p className="kicker">সাময়িক সমস্যা</p>
        <h1>পাতাটি এই মুহূর্তে দেখানো যাচ্ছে না</h1>
        <p>তথ্য আনতে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-brass" onClick={() => reset()}>আবার চেষ্টা করুন</button>
          <Link className="btn btn-line" href="/">হোম পেজে যান</Link>
        </div>
      </div>
    </section>
  );
}
