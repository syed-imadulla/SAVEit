import React, { useState, useMemo } from 'react';
import {
  Link as LinkIcon,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clipboard,
  X,
} from 'lucide-react';
import { Platform } from '../types/item';

interface UrlCaptureBarProps {
  onCapture: (url: string) => Promise<{ isDuplicate: boolean; message: string }>;
  isSubmitting: boolean;
}

export const UrlCaptureBar: React.FC<UrlCaptureBarProps> = ({
  onCapture,
  isSubmitting,
}) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // Live detection of platform as user types
  const detectedPlatform = useMemo<Platform | null>(() => {
    if (!url.trim()) return null;
    const lower = url.toLowerCase();
    if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
      return 'instagram';
    }
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
      return 'youtube';
    }
    return null;
  }, [url]);

  // Client-side quick check
  const validationWarning = useMemo<string | null>(() => {
    if (!url.trim()) return null;

    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();

      // Check SSRF targets
      if (
        host === 'localhost' ||
        host.startsWith('127.') ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.startsWith('172.') ||
        host === '169.254.169.254'
      ) {
        return 'Internal and private IP addresses are blocked for security.';
      }

      if (
        !host.includes('instagram.com') &&
        !host.includes('instagr.am') &&
        !host.includes('youtube.com') &&
        !host.includes('youtu.be')
      ) {
        return 'Only Instagram Reels and YouTube Shorts URLs are currently supported.';
      }
    } catch {
      // Allow partial typing before reporting invalid syntax
      if (url.trim().length > 15 && !url.includes('://')) {
        return 'Please enter a full URL starting with https://';
      }
    }

    return null;
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isSubmitting) return;

    setError(null);
    setSuccessInfo(null);

    if (validationWarning) {
      setError(validationWarning);
      return;
    }

    try {
      const result = await onCapture(url.trim());
      setUrl('');
      setSuccessInfo(result.message);

      // Auto-clear success message after 4s
      setTimeout(() => {
        setSuccessInfo(null);
      }, 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to capture video. Please try again.');
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setError(null);
      }
    } catch {
      // Clipboard read permission might be denied
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto my-6">
      <form onSubmit={handleSubmit} className="relative">
        <div className="glass-panel rounded-2xl p-2 shadow-2xl transition-all duration-300 focus-within:border-brand-500/50 focus-within:ring-2 focus-within:ring-brand-500/20">
          <div className="flex items-center gap-2">
            {/* Live Platform Icon */}
            <div className="pl-3 flex items-center justify-center shrink-0">
              {detectedPlatform === 'instagram' ? (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shadow-sm shadow-rose-500/30"
                  title="Instagram Reel detected"
                >
                  <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
              ) : detectedPlatform === 'youtube' ? (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-600 shadow-sm shadow-red-600/30"
                  title="YouTube Short detected"
                >
                  <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-800 text-slate-400">
                  <LinkIcon className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* Input Element */}
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Paste Instagram Reel or YouTube Short URL..."
              disabled={isSubmitting}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm md:text-base text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
            />

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 pr-1">
              {url ? (
                <button
                  type="button"
                  onClick={() => {
                    setUrl('');
                    setError(null);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePaste}
                  className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors border border-slate-700/50"
                  title="Paste from clipboard"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Paste</span>
                </button>
              )}

              <button
                type="submit"
                disabled={!url.trim() || isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-500/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Live Validation Warning or Error Banner */}
        {(error || (validationWarning && url.length > 20)) && (
          <div className="mt-2.5 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs sm:text-sm text-rose-300 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error || validationWarning}</span>
            </div>
            {error && (
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-rose-400 hover:text-rose-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Success Confirmation Toast */}
        {successInfo && (
          <div className="mt-2.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs sm:text-sm text-emerald-300 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successInfo}</span>
          </div>
        )}
      </form>
    </div>
  );
};
