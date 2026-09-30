import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Noto_Sans_Bengali, Noto_Serif_Bengali } from 'next/font/google';
import './globals.css';
import './site.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Motion from '@/components/Motion';
import { getGallery, getPage, getSite, soft } from '@/lib/api';
import { safeHref } from '@/lib/links';
import { bnText } from '@/lib/format';

const sans = Noto_Sans_Bengali({ subsets: ['bengali', 'latin'], axes: ['wdth'], display: 'swap', variable: '--font-sans' });
const serif = Noto_Serif_Bengali({ subsets: ['bengali', 'latin'], weight: ['500', '600', '700', '800', '900'], display: 'swap', variable: '--font-serif' });

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const site = await soft(getSite(), null);
  const layout = await soft(getPage('layout'), null);
  const name = site?.mp.name ?? '';
  const title = bnText(site?.mp.title);
  return {
    title: { default: [name, title].filter(Boolean).join(' · ') || 'জনসেতু', template: name ? `%s · ${name}` : '%s' },
    description: layout?.tagline || site?.slogan || undefined,
    robots: process.env.NODE_ENV === 'production' ? undefined : { index: false, follow: false },
    openGraph: { type: 'website', locale: 'bn_BD', siteName: name || undefined },
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0C1117' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = headers().get('x-nonce') ?? undefined;
  const [site, layout, contact, gallery] = await Promise.all([soft(getSite(), null), soft(getPage('layout'), null), soft(getPage('contact'), null), soft(getGallery({ limit: 100 }), null)]);
  const photoCredits = (gallery?.items ?? []).map((g) => g.credit).filter(Boolean);
  const accent = site?.theme?.accent && ['brass', 'river', 'maroon'].includes(site.theme.accent) ? site.theme.accent : 'brass';
  const notice = layout?.notice?.on && layout.notice.text ? { text: layout.notice.text, href: safeHref(layout.notice.link) } : null;
  const name = site?.mp.name ?? '';
  const title = bnText(site?.mp.title);
  const complaintOn = site?.complaintBoxEnabled ?? true;
  return (
    <html lang="bn" data-accent={accent} className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a className="skip" href="#main">মূল অংশে যান</a>
        <Header name={name} title={title} notice={notice} complaintOn={complaintOn} />
        <main id="main" tabIndex={-1}>{children}</main>
        <Footer name={name} title={title} layout={layout} contact={contact} complaintOn={complaintOn} photoCredits={photoCredits} />
        <Motion />
      </body>
    </html>
  );
}
