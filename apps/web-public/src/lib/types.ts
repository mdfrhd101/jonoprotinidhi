/* Shapes returned by the public API (apps/api/src/routes/public.ts + services). Page data types come from the shared
   zod schemas so they follow the CMS automatically. */
import type { PageData, PageKey } from '@jonoshetu/shared';

export type { PageKey };
export type LayoutPage = PageData<'layout'>;
export type HomePage = PageData<'home'>;
export type ProfilePage = PageData<'profile'>;
export type HeroesPage = PageData<'heroes'>;
export type AreaPage = PageData<'area'>;
export type ContactPage = PageData<'contact'>;
export type ComplaintPage = PageData<'complaint'>;
export type Hero = { kicker: string; title: string; intro: string };
export type Upazila = AreaPage['upazilas'][number];

export type Banner = { url: string; caption: string; title?: string; subtitle?: string; ctaLabel?: string; ctaHref?: string };
export type SectionKey = 'stats' | 'about' | 'activities' | 'office' | 'promises' | 'area' | 'gallery' | 'videos' | 'events' | 'cta';

export type Site = {
  host: string;
  mp: { name: string; title: string; role: string; ministry: string; seat: string };
  theme: { accent?: 'brass' | 'river' | 'maroon' | string };
  slogan: string;
  banners: Banner[];
  sections: Array<{ key: SectionKey | string; on: boolean }>;
  counts: { posts: number; promises: number; complaints: number };
  complaintBoxEnabled: boolean;
};

export type MediaRef = { url: string; caption?: string; credit?: string };
export type Post = {
  slug: string; title: string; summary: string; body?: string; quote?: string; category: string; upazila?: string; place?: string;
  eventDate: string; media?: MediaRef[]; publishedAt?: string;
};
export type Paged<T> = { items: T[]; page: number; total: number; totalPages: number; limit?: number };

export type PromiseItem = {
  id: string; sector: string; name: string; place: string; budget: string; target: string; pct: number; status: 'done' | 'ongoing' | 'late' | 'plan' | string;
  delayReason: string; updates: Array<{ date: string; text: string }>; featured: boolean; lastChangedAt?: string;
};
export type Promises = { summary: Record<string, number>; items: PromiseItem[] };

export type EventItem = { id: string; title: string; date: string; time: string; place: string; note: string };
export type GalleryItem = { id: string; url: string; caption: string; credit: string; album: string; takenAt: string | null; featured: boolean };
export type Album = { name: string; count: number };
export type VideoItem = {
  id: string; title: string; description: string; date: string | null; kind: 'youtube' | 'upload' | string; youtubeId: string | null;
  fileUrl: string | null; posterUrl: string; embedUrl: string | null; duration: string; featured: boolean;
};
export type ComplaintStats = { month: string; received: number; resolved: number; avgDays: number; byCategory: Array<{ category: string; count: number }> };
export type ComplaintForm = { categories: string[]; otpRequired: boolean; enabled: boolean };
export type TrackResult = { trackingId: string; category: string; upazila: string; union: string; status: string; submittedAt: string; steps: Array<{ label: string; note: string; at: string }> };
