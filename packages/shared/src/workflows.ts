/* State machines used by the API (authoritative) and the admin UI (to show only valid buttons). */

export const POST_STATUSES = ['draft', 'review', 'scheduled', 'published', 'rejected', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export type PostAction = 'submit' | 'approve' | 'schedule' | 'reject' | 'withdraw' | 'edit' | 'publishNow' | 'cancelSchedule' | 'unpublish' | 'restore';

/**
 * `live` content (what the public sees) is separate from the working copy, so editing a published post moves it
 * to `review` but the public keeps seeing the last approved version until the owner approves the change.
 */
export const postTransitions: Record<PostStatus, Partial<Record<PostAction, PostStatus>>> = {
  draft: { submit: 'review', approve: 'published', schedule: 'scheduled' },
  review: { approve: 'published', schedule: 'scheduled', reject: 'rejected', withdraw: 'draft' },
  rejected: { edit: 'draft', submit: 'review' },
  scheduled: { publishNow: 'published', cancelSchedule: 'review' },
  published: { unpublish: 'archived', edit: 'review' },
  archived: { restore: 'review' },
};

export function nextPostStatus(from: PostStatus, action: PostAction): PostStatus | null {
  return postTransitions[from]?.[action] ?? null;
}
export function availablePostActions(from: PostStatus): PostAction[] {
  return Object.keys(postTransitions[from] ?? {}) as PostAction[];
}

export const COMPLAINT_STATUSES = ['new', 'verify', 'progress', 'solved', 'closed', 'spam'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const complaintTransitions: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  new: ['verify', 'spam'],
  verify: ['progress', 'spam'],
  progress: ['solved'],
  solved: ['closed', 'progress'],
  closed: [],
  spam: ['new'],
};

export function canComplaintTransition(from: ComplaintStatus, to: ComplaintStatus): boolean {
  return complaintTransitions[from]?.includes(to) ?? false;
}

export const PROMISE_STATUSES = ['done', 'ongoing', 'late', 'plan'] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];
