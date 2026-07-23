import { statusSlug } from '@/lib/status';
import type { Status } from '@/lib/types';

interface Props {
  status: Status | string;
  className?: string;
}

// A status pill using the per-theme CSS variables.
export default function StatusBadge({ status, className = '' }: Props) {
  const slug = statusSlug(status);
  return <span className={`status-badge status-badge--${slug} ${className}`}>{status}</span>;
}
