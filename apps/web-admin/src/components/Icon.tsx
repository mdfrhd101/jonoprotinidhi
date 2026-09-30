import type { ComponentType, SVGProps } from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Bell, Building2, CalendarClock, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ChevronsUpDown, CircleDashed, Clock, ClipboardCheck, Copy, Download, ExternalLink, Eye, EyeOff, FileText, Filter, FolderOpen, GalleryHorizontal, Globe, GripVertical,
  Hourglass, Image as ImageIcon, ImageUp, Images, Inbox, Info, Landmark, Layers, LayoutDashboard, Link2, ListChecks, Loader2, Lock, LogOut, Map as MapIcon, MapPin, Megaphone,
  Menu, MessageSquareWarning, Minus, MoreHorizontal, Newspaper, PanelLeftClose, PanelLeftOpen, PanelTop, Pencil, Phone, Play, Plus, RotateCw, Rocket, Save, ScrollText, Search,
  Send, Settings, ShieldCheck, Sparkles, Star, Target, Trash2, TrendingDown, TrendingUp, Type, Undo2, Upload, UserRound, Users, Video, X, Home,
} from 'lucide-react';

/* One place for every icon the admin uses, addressed by a semantic name so pages never import lucide directly.
   Add a name here when you need a new icon (tree-shaking keeps the bundle small). */

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

export const ICONS = {
  dashboard: LayoutDashboard, posts: Newspaper, approvals: ClipboardCheck, gallery: Images, video: Video, events: CalendarDays, promises: Target,
  home: Home, profile: UserRound, area: MapIcon, contact: Phone, complaints: MessageSquareWarning, header: PanelTop, titles: Type, banners: GalleryHorizontal,
  media: FolderOpen, team: Users, audit: ScrollText, settings: Settings, tenants: Landmark, office: Building2,
  plus: Plus, minus: Minus, edit: Pencil, trash: Trash2, save: Save, send: Send, undo: Undo2, copy: Copy, link: Link2, upload: Upload, download: Download, imageUp: ImageUp, image: ImageIcon,
  external: ExternalLink, arrowRight: ArrowRight, arrowUp: ArrowUp, arrowDown: ArrowDown, arrowUpRight: ArrowUpRight, chevronDown: ChevronDown, chevronRight: ChevronRight, chevronLeft: ChevronLeft, chevronsUpDown: ChevronsUpDown,
  bell: Bell, menu: Menu, close: X, search: Search, filter: Filter, more: MoreHorizontal, logout: LogOut, user: UserRound, globe: Globe, pin: MapPin, star: Star, grip: GripVertical,
  check: Check, checkAll: CheckCheck, checkCircle: CheckCircle2, circle: CircleDashed, alert: AlertTriangle, info: Info, clock: Clock, hourglass: Hourglass, lock: Lock, shield: ShieldCheck, eye: Eye, eyeOff: EyeOff,
  trendUp: TrendingUp, trendDown: TrendingDown, activity: Activity, sparkles: Sparkles, rocket: Rocket, megaphone: Megaphone, file: FileText, inbox: Inbox, layers: Layers, list: ListChecks, calendarClock: CalendarClock, play: Play,
  refresh: RotateCw, spinner: Loader2, collapse: PanelLeftClose, expand: PanelLeftOpen,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export type IconProps = { name: IconName; size?: number; strokeWidth?: number; className?: string; /** decorative by default; pass a label to expose it */ label?: string };

/** Decorative unless `label` is given. Size in px (default 18). */
export function Icon({ name, size = 18, strokeWidth = 2, className, label }: IconProps) {
  const C = ICONS[name] as LucideIcon;
  return <C width={size} height={size} strokeWidth={strokeWidth} className={className} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} focusable="false" />;
}
