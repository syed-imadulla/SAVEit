import {
  Tag,
  ArrowUpDown,
  X,
  Layers,
  Filter,
  Loader2,
} from 'lucide-react';
import { TagCount, SortByOption, SortOrderOption } from '../types/item';

interface FilterBarProps {
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
  selectedContentType: string;
  onSelectContentType: (contentType: string) => void;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  sortBy: SortByOption;
  onSelectSortBy: (sortBy: SortByOption) => void;
  sortOrder: SortOrderOption;
  onSelectSortOrder: (sortOrder: SortOrderOption) => void;
  availableTags: TagCount[];
  isLoadingTags?: boolean;
  searchQuery?: string;
  onClearSearch?: () => void;
  onClearAllFilters: () => void;
}

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Statuses', value: '' },
  { label: 'Fully Analyzed', value: 'full_analyzed' },
  { label: 'Partially Analyzed', value: 'partially_analyzed' },
  { label: 'Metadata Only', value: 'metadata_only' },
  { label: 'Queued', value: 'queued' },
  { label: 'Inaccessible', value: 'unsupported_inaccessible' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedPlatform,
  onSelectPlatform,
  selectedStatus,
  onSelectStatus,
  selectedContentType,
  onSelectContentType,
  selectedTag,
  onSelectTag,
  sortBy,
  onSelectSortBy,
  sortOrder,
  onSelectSortOrder,
  availableTags,
  isLoadingTags = false,
  searchQuery = '',
  onClearSearch,
  onClearAllFilters,
}) => {
  // Count active filters
  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    selectedPlatform ||
    selectedStatus ||
    selectedContentType ||
    selectedTag ||
    sortBy !== 'capturedAt' ||
    sortOrder !== 'desc'
  );

  return (
    <div className="w-full space-y-3">
      {/* Primary Filter Rows */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Platform & Status Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Platform Selector Buttons */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => onSelectPlatform('')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                selectedPlatform === ''
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All</span>
            </button>
            <button
              type="button"
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
              type="button"
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

          {/* Status Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedStatus}
              onChange={(e) => onSelectStatus(e.target.value)}
              aria-label="Filter by processing status"
              className="bg-slate-900/80 border border-white/[0.08] text-slate-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500/50 cursor-pointer hover:bg-slate-900 transition-colors"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Sort Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/80 border border-white/[0.08] px-2.5 py-1 rounded-xl">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => onSelectSortBy(e.target.value as SortByOption)}
              aria-label="Sort items by"
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value="capturedAt" className="bg-slate-900 text-slate-200">
                Capture Date
              </option>
              <option value="analyzedAt" className="bg-slate-900 text-slate-200">
                Analysis Date
              </option>
              <option value="relevance" className="bg-slate-900 text-slate-200">
                Relevance
              </option>
            </select>
            <button
              type="button"
              onClick={() => onSelectSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              aria-label={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
              title={`Switch to ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
              className="text-[11px] font-semibold uppercase px-1 py-0.5 rounded text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              {sortOrder}
            </button>
          </div>
        </div>
      </div>

      {/* Tag Discovery Bar */}
      {(availableTags.length > 0 || isLoadingTags) && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
          <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-1" />
          <span className="text-[11px] font-medium text-slate-400 shrink-0 mr-1 hidden sm:inline">
            Tags:
          </span>
          {isLoadingTags && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 shrink-0 mr-1" />
          )}
          {availableTags.slice(0, 15).map((t) => {
            const isSelected = selectedTag.toLowerCase() === t.tag.toLowerCase();
            return (
              <button
                key={t.tag}
                type="button"
                onClick={() => onSelectTag(isSelected ? '' : t.tag)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-white/[0.06]'
                }`}
              >
                <span>#{t.tag}</span>
                <span className="text-[10px] opacity-60">({t.count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Filter Chips Row */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/[0.04]">
          <span className="text-[11px] text-slate-500 font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Active:
          </span>

          {/* Search Query Chip */}
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              <span>Query: "{searchQuery}"</span>
              {onClearSearch && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  aria-label="Remove search filter"
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}

          {/* Platform Chip */}
          {selectedPlatform && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-200 border border-white/[0.08]">
              <span>Platform: {selectedPlatform === 'youtube' ? 'YouTube' : 'Instagram'}</span>
              <button
                type="button"
                onClick={() => onSelectPlatform('')}
                aria-label="Remove platform filter"
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Status Chip */}
          {selectedStatus && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-200 border border-white/[0.08]">
              <span>
                Status: {STATUS_OPTIONS.find((s) => s.value === selectedStatus)?.label || selectedStatus}
              </span>
              <button
                type="button"
                onClick={() => onSelectStatus('')}
                aria-label="Remove status filter"
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Content Type Chip */}
          {selectedContentType && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-200 border border-white/[0.08]">
              <span>Content: {selectedContentType}</span>
              <button
                type="button"
                onClick={() => onSelectContentType('')}
                aria-label="Remove content type filter"
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Tag Chip */}
          {selectedTag && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <span>Tag: #{selectedTag}</span>
              <button
                type="button"
                onClick={() => onSelectTag('')}
                aria-label="Remove tag filter"
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Sort Chip (if non-default) */}
          {(sortBy !== 'capturedAt' || sortOrder !== 'desc') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-200 border border-white/[0.08]">
              <span>
                Sort: {sortBy} ({sortOrder})
              </span>
              <button
                type="button"
                onClick={() => {
                  onSelectSortBy('capturedAt');
                  onSelectSortOrder('desc');
                }}
                aria-label="Reset sort to default"
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Clear All Button */}
          <button
            type="button"
            onClick={onClearAllFilters}
            className="text-[11px] font-medium text-slate-400 hover:text-emerald-400 transition-colors ml-1 underline decoration-dotted"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};
