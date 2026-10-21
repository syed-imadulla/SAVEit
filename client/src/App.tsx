import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { UrlCaptureBar } from './components/UrlCaptureBar';
import { LibraryFeed } from './components/LibraryFeed';
import {
  SavedItem,
  HealthResponse,
  TagCount,
  SortByOption,
  SortOrderOption,
} from './types/item';
import {
  fetchItems,
  fetchTags,
  captureItem,
  deleteItem,
  checkHealth,
} from './services/api';

export const App: React.FC = () => {
  // Library items & pagination
  const [items, setItems] = useState<SavedItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [selectedContentType, setSelectedContentType] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortByOption>('capturedAt');
  const [sortOrder, setSortOrder] = useState<SortOrderOption>('desc');

  // Tag discovery
  const [availableTags, setAvailableTags] = useState<TagCount[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState<boolean>(false);

  // Backend Health
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Abort controller ref to cancel in-flight requests and prevent race conditions
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check backend health
  const verifyBackendHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  }, []);

  // Fetch available tags
  const loadTags = useCallback(async () => {
    setIsLoadingTags(true);
    try {
      const res = await fetchTags();
      setAvailableTags(res.tags);
    } catch (err) {
      console.warn('[App] Failed to load tags:', err);
    } finally {
      setIsLoadingTags(false);
    }
  }, []);

  // Fetch saved items with active search, filter, and pagination options
  const loadItems = useCallback(async (targetPage = page) => {
    // Cancel any ongoing in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const res = await fetchItems(
        {
          q: searchQuery || undefined,
          status: selectedStatus || undefined,
          platform: selectedPlatform || undefined,
          contentType: selectedContentType || undefined,
          tag: selectedTag || undefined,
          sortBy: sortBy,
          sortOrder: sortOrder,
          page: targetPage,
          limit: 18,
        },
        controller.signal
      );

      setItems(res.items);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[App] Failed to load items:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedStatus, selectedPlatform, selectedContentType, selectedTag, sortBy, sortOrder, page]);

  // Initial load and periodic health checks
  useEffect(() => {
    verifyBackendHealth();
    loadTags();

    const interval = setInterval(verifyBackendHealth, 30000);
    return () => clearInterval(interval);
  }, [verifyBackendHealth, loadTags]);

  // Load items whenever filters or search query change
  useEffect(() => {
    loadItems(page);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadItems, page]);

  // Handlers that reset page to 1 on filter/search change
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setPage(1);
  };

  const handlePlatformChange = (platform: string) => {
    setSelectedPlatform(platform);
    setPage(1);
  };

  const handleContentTypeChange = (contentType: string) => {
    setSelectedContentType(contentType);
    setPage(1);
  };

  const handleTagChange = (tag: string) => {
    setSelectedTag(tag);
    setPage(1);
  };

  const handleSortByChange = (newSortBy: SortByOption) => {
    setSortBy(newSortBy);
    setPage(1);
  };

  const handleSortOrderChange = (newSortOrder: SortOrderOption) => {
    setSortOrder(newSortOrder);
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setSelectedStatus('');
    setSelectedPlatform('');
    setSelectedContentType('');
    setSelectedTag('');
    setSortBy('capturedAt');
    setSortOrder('desc');
    setPage(1);
  };

  // Handle URL Capture
  const handleCapture = async (url: string) => {
    setIsSubmitting(true);
    try {
      const res = await captureItem(url);

      // Reload tags and items to include newly analyzed metadata & tags
      loadTags();
      loadItems(1);

      return {
        isDuplicate: res.isDuplicate,
        message: res.message,
      };
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Item Update (from re-analysis in modal)
  const handleItemUpdated = (updatedItem: SavedItem) => {
    setItems((prev) => prev.map((item) => (item._id === updatedItem._id ? updatedItem : item)));
    loadTags();
  };

  // Handle Item Deletion
  const handleDelete = async (id: string) => {
    await deleteItem(id);
    setItems((prev) => prev.filter((item) => item._id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    loadTags();
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <Header totalItems={total} health={health} />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* Hero & Capture Section */}
        <section className="pt-10 pb-4 px-4 text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI Knowledge Engine</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-3">
            Turn Reels & Shorts into{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Searchable Knowledge
            </span>
          </h2>

          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed mb-4">
            Save educational videos once. We preserve original sources, extract key points & tools, and make everything easy to find.
          </p>

          {/* Capture Component */}
          <UrlCaptureBar onCapture={handleCapture} isSubmitting={isSubmitting} />
        </section>

        {/* Library Feed Section */}
        <LibraryFeed
          items={items}
          totalItems={total}
          isLoading={isLoading}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          selectedStatus={selectedStatus}
          onSelectStatus={handleStatusChange}
          selectedPlatform={selectedPlatform}
          onSelectPlatform={handlePlatformChange}
          selectedContentType={selectedContentType}
          onSelectContentType={handleContentTypeChange}
          selectedTag={selectedTag}
          onSelectTag={handleTagChange}
          sortBy={sortBy}
          onSelectSortBy={handleSortByChange}
          sortOrder={sortOrder}
          onSelectSortOrder={handleSortOrderChange}
          availableTags={availableTags}
          isLoadingTags={isLoadingTags}
          onClearAllFilters={handleClearAllFilters}
          onDeleteItem={handleDelete}
          onItemUpdated={handleItemUpdated}
        />
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SAVEit — Personal Knowledge Library</span>
          <span>Phase 5: Search & Knowledge Discovery</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
