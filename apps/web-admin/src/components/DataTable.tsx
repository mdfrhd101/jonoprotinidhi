import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Skeleton } from './primitives';

/* DataTable: a polished, accessible table that turns into a stack of cards below 720px (each cell gets its header as a
   label). Plain <table className="tbl"> inside <div className="tbl-wrap"> is styled too, this is the batteries-included version. */

export type Column<T> = {
  key: string; header: ReactNode; cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center'; width?: number | string; nowrap?: boolean;
  /** on mobile cards the cell is shown without its label, as the card title */ primary?: boolean;
  /** text for the mobile label when `header` is not a string */ mobileLabel?: string; hideOnMobile?: boolean;
};

export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, caption, empty, dense, loading, loadingRows = 5, rowLabel }: {
  columns: Array<Column<T>>; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; selectedKey?: string | null;
  /** accessible table name (visually hidden) */ caption: string; empty?: ReactNode; dense?: boolean; loading?: boolean; loadingRows?: number;
  /** accessible name of a clickable row, e.g. the title */ rowLabel?: (row: T) => string;
}) {
  const onKey = (e: KeyboardEvent, row: T) => { if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(row); } };
  if (!loading && !rows.length && empty) return <>{empty}</>;
  // while loading: div skeleton (not table rows, so anything waiting for `.tbl tbody tr` only ever sees real data)
  if (loading) return <div className="tbl-wrap skel-rows" role="status" aria-label="লোড হচ্ছে">{Array.from({ length: loadingRows }, (_, i) => <div className="skel-row" key={i}><Skeleton h={14} w="60%" /><Skeleton h={12} w="30%" /></div>)}</div>;
  return (
    <div className="tbl-wrap">
      <table className={`tbl cards${dense ? ' dense' : ''}`}>
        <caption className="sr">{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" style={{ textAlign: c.align, width: c.width }} className={c.hideOnMobile ? 'hm' : undefined}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => {
              const k = rowKey(row);
              return (
                <tr key={k} className={`${onRowClick ? 'row-link' : ''}${selectedKey === k ? ' sel' : ''}`} onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => onKey(e, row) : undefined} aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} data-label={typeof c.header === 'string' ? c.header : c.mobileLabel} data-primary={c.primary ? '' : undefined} className={`${c.hideOnMobile ? 'hm' : ''}${c.nowrap ? ' nw' : ''}`} style={{ textAlign: c.align }}>{c.cell(row)}</td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/** Main cell of a row: optional thumbnail, a bold title (optionally a link) and a muted second line. */
export function CellMain({ title, sub, to, thumb, icon = 'file' }: { title: ReactNode; sub?: ReactNode; to?: string; thumb?: string | null; icon?: 'file' | 'image' | 'video' | 'events' }) {
  return (
    <div className="cell-main">
      {(thumb !== undefined) && (thumb ? <img className="cell-thumb" src={thumb} alt="" loading="lazy" /> : <span className="cell-thumb ph" aria-hidden><Icon name={icon} size={18} /></span>)}
      <div>{to ? <Link to={to} className="cell-t"><b>{title}</b></Link> : <b className="cell-t">{title}</b>}{sub && <small>{sub}</small>}</div>
    </div>
  );
}

/** Right-aligned action buttons cell. */
export function RowActions({ children }: { children: ReactNode }) { return <div className="acts row-acts">{children}</div>; }
