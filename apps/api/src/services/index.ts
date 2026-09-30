import type { Deps } from '../deps.js';
import { AuthService } from './auth.js';
import { TenantService } from './tenants.js';
import { PostService } from './posts.js';
import { PromiseService } from './promises.js';
import { ComplaintService } from './complaints.js';
import { TeamService } from './team.js';
import { SiteService } from './site.js';
import { MediaService } from './media.js';
import { PageService } from './pages.js';
import { EventService, GalleryService, VideoService } from './collections.js';

export type Services = {
  auth: AuthService; tenants: TenantService; posts: PostService; promises: PromiseService;
  complaints: ComplaintService; team: TeamService; site: SiteService; media: MediaService;
  pages: PageService; events: EventService; gallery: GalleryService; videos: VideoService;
};

export function createServices(d: Deps, now: () => number = Date.now): Services {
  const media = new MediaService(d);
  return {
    auth: new AuthService(d, now),
    tenants: new TenantService(d, now),
    posts: new PostService(d.config, now),
    promises: new PromiseService(now),
    complaints: new ComplaintService(d, now),
    team: new TeamService(d, now),
    site: new SiteService(d.config),
    media,
    pages: new PageService(d.config, now),
    events: new EventService(d.config, now),
    gallery: new GalleryService(d.config, now),
    videos: new VideoService(d.config, media, now),
  };
}
