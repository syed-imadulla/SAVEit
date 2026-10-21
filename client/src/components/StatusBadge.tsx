import React from 'react';
import {
  Clock,
  CheckCircle2,
  PieChart,
  FileText,
  HelpCircle,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { ProcessingStatus } from '../types/item';

interface StatusBadgeProps {
  status: ProcessingStatus;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

interface StatusConfig {
  label: string;
  badgeClass: string;
  icon: React.ElementType;
  description: string;
}

const STATUS_MAP: Record<ProcessingStatus, StatusConfig> = {
  queued: {
    label: 'Queued',
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    icon: Clock,
    description: 'Saved and awaiting processing',
  },
  full_analyzed: {
    label: 'Full Analysis',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    icon: CheckCircle2,
    description: 'Audio and visual streams analyzed',
  },
  partially_analyzed: {
    label: 'Partial',
    badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    icon: PieChart,
    description: 'Only some evidence types accessible',
  },
  metadata_only: {
    label: 'Metadata Only',
    badgeClass: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    icon: FileText,
    description: 'Substantive content was restricted; source preserved',
  },
  needs_user_input: {
    label: 'Needs Input',
    badgeClass: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    icon: HelpCircle,
    description: 'Optional transcript or login could help',
  },
  retryable_failure: {
    label: 'Retryable',
    badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    icon: RefreshCw,
    description: 'Temporary platform or network issue',
  },
  unsupported_inaccessible: {
    label: 'Inaccessible',
    badgeClass: 'bg-slate-700/30 text-slate-400 border-slate-600/30',
    icon: Lock,
    description: 'Platform access denied or unsupported',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showIcon = true,
  size = 'md',
}) => {
  const config = STATUS_MAP[status] || STATUS_MAP.queued;
  const Icon = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5 font-medium';

  return (
    <span
      title={config.description}
      className={`inline-flex items-center rounded-full border ${config.badgeClass} ${sizeClasses} select-none`}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
      <span>{config.label}</span>
    </span>
  );
};
