import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="state dark">
      <div>
        <p className="kicker">৪০৪</p>
        <h1>পাতাটি পাওয়া যায়নি</h1>
        <p>লিংকটি পুরনো বা ভুল হতে পারে। মেনু থেকে অথবা হোম পেজ থেকে খুঁজে দেখুন।</p>
        <Link className="btn btn-brass" href="/">হোম পেজে যান</Link>
      </div>
    </section>
  );
}
