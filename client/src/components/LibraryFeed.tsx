import React from 'react';
import {
  Inbox,
  Filter,
  Loader2,
  Layers,
} from 'lucide-react';
import { SavedItem } from '../types/item';
import { ItemCard } from './ItemCard';

interface LibraryFeedProps {
  items: SavedItem[];
  isLoading: boolean;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
  onDeleteItem: (id: string) => Promise<void>;
}

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All Items', value: '' },
  { label: 'Queued', value: 'queued' },
  { label: 'Full Analysis', value: 'full_analyzed' },
  { label: 'Partial', value: 'partially_analyzed' },
  { label: 'Metadata Only', value: 'metadata_only' },
  { label: 'Inaccessible', value: 'unsupported_inaccessible' },
];

export const LibraryFeed: React.FC<LibraryFeedProps> = ({
  items,
  isLoading,
  selectedStatus,
  onSelectStatus,
  selectedPlatform,
  onSelectPlatform,
  onDeleteItem,
}) => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 my-8">
      {/* Controls Bar: Filters and Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
          <Filter className="w-4 h-4 text-slate-500 mr-1 shrink-0 hidden md:block" />
          {STATUS_FILTERS.map((filter) => {
            const isActive = selectedStatus === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => onSelectStatus(filter.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-white/[0.06]'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {/* Platform Selector Buttons */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/[0.06] shrink-0 self-start sm:self-auto">
          <button
            onClick={() => onSelectPlatform('')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              selectedPlatform === ''
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All</span>
          </button>
          <button
            onClick={() => onSelectPlatform('instagram')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              selectedPlatform === 'instagram'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Reels</span>
          </button>
          <button
            onClick={() => onSelectPlatform('youtube')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              selectedPlatform === 'youtube'
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Shorts</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-sm font-medium">Loading saved knowledge...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-white/[0.06] flex items-center justify-center text-slate-500 mb-4 shadow-inner">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">
            {selectedStatus || selectedPlatform ? 'No matching videos found' : 'Your library is empty'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed mb-6">
            {selectedStatus || selectedPlatform
              ? 'Try adjusting your filters above to see more saved knowledge.'
              : 'Paste an Instagram Reel or YouTube Short URL in the capture bar above. Your videos will be safely preserved and organized here.'}
          </p>
          {(selectedStatus || selectedPlatform) && (
            <button
              onClick={() => {
                onSelectStatus('');
                onSelectPlatform('');
              }}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors border border-white/[0.08]"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
          {items.map((item) => (
            <ItemCard key={item._id} item={item} onDelete={onDeleteItem} />
          ))}
        </div>
      )}
    </div>
  );
};
