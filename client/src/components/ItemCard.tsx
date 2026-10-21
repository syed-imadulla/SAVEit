import React, { useState } from 'react';
import {
  ExternalLink,
  Trash2,
  Calendar,
  Loader2,
} from 'lucide-react';
import { SavedItem } from '../types/item';
import { StatusBadge } from './StatusBadge';

interface ItemCardProps {
  item: SavedItem;
  onDelete: (id: string) => Promise<void>;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onDelete }) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isInstagram = item.platform === 'instagram';

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 60) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(item._id);
    } catch {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  return (
    <div className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col justify-between border border-white/[0.08] relative group overflow-hidden">
      {/* Platform & Status Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Platform Badge */}
          <div className="flex items-center gap-2">
            {isInstagram ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-purple-600/20 text-rose-300 border border-rose-500/30">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Instagram Reel
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                YouTube Short
              </span>
            )}
          </div>

          {/* Honest Status Badge */}
          <StatusBadge status={item.status} size="sm" />
        </div>

        {/* Content Title / Fallback Description */}
        <h3 className="text-base font-semibold text-slate-100 line-clamp-2 mb-2 group-hover:text-emerald-300 transition-colors">
          {item.title || (isInstagram ? `Instagram Reel (${item.platformId || 'Saved'})` : `YouTube Short (${item.platformId || 'Saved'})`)}
        </h3>

        {/* Summary preview or honest status note */}
        <p className="text-xs text-slate-400 line-clamp-3 mb-4 leading-relaxed">
          {item.summary || (
            item.status === 'queued'
              ? 'Item is preserved and queued for retrieval and extraction.'
              : item.status === 'unsupported_inaccessible'
              ? 'Content is currently restricted by platform privacy or anti-bot protections.'
              : 'Original link preserved in library.'
          )}
        </p>
      </div>

      {/* Card Footer: Metadata and Actions */}
      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
        {/* Timestamp */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span>{formatRelativeTime(item.capturedAt)}</span>
        </div>

        {/* Action Links */}
        <div className="flex items-center gap-1">
          {/* External Source Link */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors flex items-center gap-1"
            title="Open original video source"
          >
            <span className="sr-only sm:not-sr-only text-[11px]">Source</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Delete Action with Inline Confirmation */}
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1 bg-slate-900 border border-rose-500/40 rounded-lg p-0.5 animate-fadeIn">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-medium transition-colors flex items-center gap-1"
              >
                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="px-1.5 py-1 text-slate-400 hover:text-slate-200 text-[11px]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Delete item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
