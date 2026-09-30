/* Small inline icons (aria-hidden; the button around them carries the label). */
type P = { className?: string };
export const IconMenu = ({ className }: P) => (<svg className={className} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>);
export const IconX = ({ className }: P) => (<svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>);
export const IconLeft = ({ className }: P) => (<svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>);
export const IconRight = ({ className }: P) => (<svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>);
export const IconPlay = ({ className }: P) => (<svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8z" fill="currentColor" /></svg>);
export const IconPause = ({ className }: P) => (<svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h2.6v12H6zM11.4 4H14v12h-2.6z" fill="currentColor" /></svg>);
export const IconExpand = ({ className }: P) => (<svg className={className} viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" stroke="currentColor" strokeWidth="1.7" fill="none" /></svg>);
export const IconCheck = ({ className }: P) => (<svg className={className} viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" /></svg>);
