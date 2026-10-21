import React, { useState } from 'react';
import {
  Inbox,
  ChevronLeft,
  ChevronRight,
  SearchX,
  RotateCcw,
} from 'lucide-react';
import { SavedItem, TagCount, SortByOption, SortOrderOption } from '../types/item';
import { ItemCard } from './ItemCard';
import { SearchBar } from './SearchBar';
import { FilterBar } from './FilterBar';
import { ItemDetailModal } from './ItemDetailModal';

interface LibraryFeedProps {
  items: SavedItem[];
  totalItems: number;
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
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
  onClearAllFilters: () => void;
  onDeleteItem: (id: string) => Promise<void>;
  onItemUpdated?: (updatedItem: SavedItem) => void;
}

export const LibraryFeed: React.FC<LibraryFeedProps> = ({
  items,
  totalItems,
  isLoading,
  page,
  totalPages,
  onPageChange,
  searchQuery,
  onSearchChange,
  selectedStatus,
  onSelectStatus,
  selectedPlatform,
  onSelectPlatform,
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
  onClearAllFilters,
  onDeleteItem,
  onItemUpdated,
}) => {
  const [selectedItem, setSelectedItem] = useState<SavedItem | null>(null);

  const hasFiltersOrSearch = Boolean(
    searchQuery.trim() ||
    selectedStatus ||
    selectedPlatform ||
    selectedContentType ||
    selectedTag ||
    sortBy !== 'capturedAt' ||
    sortOrder !== 'desc'
  );

  const handleItemUpdated = (updated: SavedItem) => {
    setSelectedItem(updated);
    onItemUpdated?.(updated);
  };

  const handleItemDeleted = async (id: string) => {
    await onDeleteItem(id);
    setSelectedItem(null);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 my-8 space-y-6">
      {/* Search and Discovery Control Panel */}
      <div className="bg-slate-900/40 p-4 sm:p-5 rounded-2xl border border-white/[0.06] backdrop-blur-sm space-y-4 shadow-sm">
        {/* Search Bar */}
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          isLoading={isLoading}
          totalMatches={hasFiltersOrSearch ? totalItems : undefined}
        />

        {/* Multi-Criteria Filters & Tags */}
        <FilterBar
          selectedPlatform={selectedPlatform}
          onSelectPlatform={onSelectPlatform}
          selectedStatus={selectedStatus}
          onSelectStatus={onSelectStatus}
          selectedContentType={selectedContentType}
          onSelectContentType={onSelectContentType}
          selectedTag={selectedTag}
          onSelectTag={onSelectTag}
          sortBy={sortBy}
          onSelectSortBy={onSelectSortBy}
          sortOrder={sortOrder}
          onSelectSortOrder={onSelectSortOrder}
          availableTags={availableTags}
          isLoadingTags={isLoadingTags}
          searchQuery={searchQuery}
          onClearSearch={() => onSearchChange('')}
          onClearAllFilters={onClearAllFilters}
        />
      </div>

      {/* Results Header / Match Counter */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          {hasFiltersOrSearch ? (
            <>
              Found <strong className="text-emerald-400 font-semibold">{totalItems}</strong> matching{' '}
              {totalItems === 1 ? 'item' : 'items'}
            </>
          ) : (
            <>
              Total Library:{' '}
              <strong className="text-slate-200 font-semibold">{totalItems}</strong>{' '}
              {totalItems === 1 ? 'item' : 'items'}
            </>
          )}
        </span>

        {totalPages > 1 && (
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-72 rounded-2xl bg-slate-900/60 border border-white/[0.04] p-5 flex flex-col justify-between animate-pulse"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-16 h-5 rounded-full bg-slate-800" />
                  <div className="w-20 h-5 rounded-full bg-slate-800" />
                </div>
                <div className="w-3/4 h-5 rounded-lg bg-slate-800" />
                <div className="w-full h-12 rounded-lg bg-slate-800/60" />
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-white/[0.04]">
                <div className="w-12 h-4 rounded bg-slate-800" />
                <div className="w-16 h-4 rounded bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        /* Empty States */
        hasFiltersOrSearch ? (
          /* Filtered search produced zero results */
          <div className="py-20 flex flex-col items-center justify-center text-center px-4 bg-slate-900/20 rounded-2xl border border-white/[0.04]">
            <div className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-white/[0.08] flex items-center justify-center text-slate-400 mb-4 shadow-inner">
              <SearchX className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">
              No matching knowledge found
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed mb-6">
              No saved items matched your query and filter criteria. Try checking for typos, using broader keywords, or removing specific filter chips.
            </p>
            <button
              type="button"
              onClick={onClearAllFilters}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700/80 transition-colors border border-emerald-500/20 shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Search & Filters</span>
            </button>
          </div>
        ) : (
          /* Empty Library State */
          <div className="py-20 flex flex-col items-center justify-center text-center px-4 bg-slate-900/20 rounded-2xl border border-white/[0.04]">
            <div className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-white/[0.08] flex items-center justify-center text-slate-500 mb-4 shadow-inner">
              <Inbox className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">
              Your knowledge library is empty
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed mb-2">
              Paste an Instagram Reel or YouTube Short URL in the capture bar above. Your videos will be safely preserved, transcribed, and organized here.
            </p>
          </div>
        )
      ) : (
        /* Populated Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <ItemCard
              key={item._id}
              item={item}
              onDelete={onDeleteItem}
              onSelect={setSelectedItem}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-6 border-t border-white/[0.06]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              page <= 1
                ? 'bg-slate-900/40 text-slate-600 border-white/[0.02] cursor-not-allowed'
                : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border-white/[0.08]'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <span className="text-xs text-slate-400 font-medium">
            Page <strong className="text-slate-200">{page}</strong> of{' '}
            <strong className="text-slate-200">{totalPages}</strong>
          </span>

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              page >= totalPages
                ? 'bg-slate-900/40 text-slate-600 border-white/[0.02] cursor-not-allowed'
                : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border-white/[0.08]'
            }`}
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Item Detail View & Evidence Inspector Modal */}
      <ItemDetailModal
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        onItemUpdated={handleItemUpdated}
        onItemDeleted={handleItemDeleted}
      />
    </div>
  );
};
