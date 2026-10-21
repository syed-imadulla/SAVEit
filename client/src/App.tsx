import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { UrlCaptureBar } from './components/UrlCaptureBar';
import { LibraryFeed } from './components/LibraryFeed';
import { SavedItem, HealthResponse } from './types/item';
import { fetchItems, captureItem, deleteItem, checkHealth } from './services/api';

export const App: React.FC = () => {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Check backend health
  const verifyBackendHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  }, []);

  // Fetch saved items
  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchItems({
        status: selectedStatus || undefined,
        platform: selectedPlatform || undefined,
        limit: 50,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('[App] Failed to load items:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, selectedPlatform]);

  useEffect(() => {
    verifyBackendHealth();
    loadItems();

    // Periodic health check every 30s
    const interval = setInterval(verifyBackendHealth, 30000);
    return () => clearInterval(interval);
  }, [verifyBackendHealth, loadItems]);

  // Handle URL Capture
  const handleCapture = async (url: string) => {
    setIsSubmitting(true);
    try {
      const res = await captureItem(url);

      // If new item, prepend to current list
      if (!res.isDuplicate) {
        setItems((prev) => [res.item, ...prev]);
        setTotal((prev) => prev + 1);
      }

      return {
        isDuplicate: res.isDuplicate,
        message: res.message,
      };
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Item Deletion
  const handleDelete = async (id: string) => {
    await deleteItem(id);
    setItems((prev) => prev.filter((item) => item._id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <Header totalItems={total} health={health} />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* Hero & Capture Section */}
        <section className="pt-10 pb-6 px-4 text-center max-w-4xl mx-auto">
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
          isLoading={isLoading}
          selectedStatus={selectedStatus}
          onSelectStatus={setSelectedStatus}
          selectedPlatform={selectedPlatform}
          onSelectPlatform={setSelectedPlatform}
          onDeleteItem={handleDelete}
        />
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SAVEit — Personal Knowledge Library</span>
          <span>Phase 1: Walking Skeleton Baseline</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
