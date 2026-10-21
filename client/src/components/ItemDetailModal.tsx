import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Calendar,
  User,
  Sparkles,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { SavedItem, ResourceVerificationStatus } from '../types/item';
import { StatusBadge } from './StatusBadge';
import { EvidenceInspector } from './EvidenceInspector';
import { reanalyzeItem } from '../services/api';

interface ItemDetailModalProps {
  item: SavedItem | null;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdated: (updatedItem: SavedItem) => void;
  onItemDeleted: (id: string) => Promise<void>;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  isOpen,
  onClose,
  onItemUpdated,
  onItemDeleted,
}) => {
  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [reanalyzeSuccess, setReanalyzeSuccess] = useState<boolean>(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const modalContainerRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElementRef = React.useRef<HTMLElement | null>(null);

  // Manage focus trap, focus restoration, and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    // Cache the element that held focus before the modal opened
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Auto-focus the close button or first focusable control inside the modal
    const focusTimer = setTimeout(() => {
      const focusables = modalContainerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables && focusables.length > 0) {
        focusables[0].focus();
      } else {
        modalContainerRef.current?.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalContainerRef.current) {
        const focusableElements = Array.from(
          modalContainerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previous active element on modal dismiss
      previousActiveElementRef.current?.focus();
    };
  }, [isOpen, onClose]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Reset feedback state when item changes
  useEffect(() => {
    setReanalyzeError(null);
    setReanalyzeSuccess(false);
    setIsConfirmingDelete(false);
  }, [item?._id]);

  if (!isOpen || !item) return null;

  const isInstagram = item.platform === 'instagram';

  const handleReanalyze = async () => {
    if (isReanalyzing) return;
    setIsReanalyzing(true);
    setReanalyzeError(null);
    setReanalyzeSuccess(false);

    try {
      const res = await reanalyzeItem(item._id);
      onItemUpdated(res.item);
      setReanalyzeSuccess(true);
      setTimeout(() => setReanalyzeSuccess(false), 5000);
    } catch (err: any) {
      setReanalyzeError(err.message || 'Re-analysis failed. Please try again.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onItemDeleted(item._id);
      onClose();
    } catch (err: any) {
      console.error('[ItemDetailModal] Delete error:', err);
      setIsDeleting(false);
    }
  };

  const renderVerificationBadge = (status: ResourceVerificationStatus) => {
    switch (status) {
      case 'verified_link':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Verified Link
          </span>
        );
      case 'unverified_mention':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <HelpCircle className="w-3 h-3 text-amber-400" />
            Unverified Mention
          </span>
        );
      case 'unavailable':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            Link Unavailable
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-800 text-slate-400 border border-white/[0.06]">
            Needs Review
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalContainerRef}
        tabIndex={-1}
        className="relative w-full max-w-4xl bg-[#0C101A] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto focus:outline-none"
      >
        {/* Top Header Bar */}
        <div className="p-4 sm:p-6 border-b border-white/[0.08] flex items-start justify-between gap-4 bg-slate-950/40">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              {/* Platform Badge */}
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

              {/* Status Badge */}
              <StatusBadge status={item.status} size="sm" />

              {/* Content Type */}
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 uppercase font-mono tracking-wider border border-white/[0.04]">
                {item.contentType}
              </span>
            </div>

            {/* Title */}
            <h2
              id="item-modal-title"
              className="text-lg sm:text-xl font-bold text-slate-100 leading-snug"
            >
              {item.title || `${isInstagram ? 'Instagram Reel' : 'YouTube Short'} (${item.platformId || 'Saved'})`}
            </h2>

            {/* Metadata (Author, Date, Duration) */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-0.5">
              {item.author && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-300 font-medium">{item.author}</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Captured {new Date(item.capturedAt).toLocaleDateString()}</span>
              </span>
              {typeof item.duration === 'number' && item.duration > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{item.duration}s</span>
                </span>
              )}
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal dialog"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Re-analysis Feedback Banner */}
          {reanalyzeSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>AI analysis and multimodal evidence grounding refreshed successfully!</span>
            </div>
          )}

          {reanalyzeError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{reanalyzeError}</span>
            </div>
          )}

          {/* Technical Summary */}
          {item.summary && (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-white/[0.08] space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Technical Summary
              </h3>
              <p className="text-sm text-slate-200 leading-relaxed font-normal">
                {item.summary}
              </p>
            </div>
          )}

          {/* Key Takeaways */}
          {item.keyPoints && item.keyPoints.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Key Takeaways & Knowledge Findings ({item.keyPoints.length})
              </h3>
              <ul className="space-y-2">
                {item.keyPoints.map((point, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/50 border border-white/[0.04] text-xs sm:text-sm text-slate-200"
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs flex items-center justify-center shrink-0 font-mono font-medium">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Discovered Resources */}
          {item.resources && item.resources.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Discovered Resources & Tools ({item.resources.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {item.resources.map((res, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-white/[0.06] flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-100">{res.name}</span>
                        {renderVerificationBadge(res.verificationStatus)}
                      </div>
                      {res.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {res.description}
                        </p>
                      )}
                    </div>

                    {res.url ? (
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium truncate pt-1 border-t border-white/[0.04]"
                      >
                        <span className="truncate">{res.url}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic pt-1 border-t border-white/[0.04]">
                        No external link provided in video
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tags & Topics
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900/80 text-teal-300 border border-teal-500/20"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Embedded Evidence Inspector */}
          <div className="space-y-3 pt-2 border-t border-white/[0.08]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Evidence Inspector & Multi-modal Verification
            </h3>
            <EvidenceInspector
              rawEvidence={item.rawEvidence}
              keyPoints={item.keyPoints}
              resources={item.resources}
            />
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          {/* Left Actions: Re-analyze & Delete */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isReanalyzing}
              onClick={handleReanalyze}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                isReanalyzing
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30 shadow-md shadow-emerald-500/10'
              }`}
            >
              {isReanalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-analyze Item</span>
                </>
              )}
            </button>

            {/* Inline Delete Confirmation */}
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1 bg-slate-900 border border-rose-500/40 rounded-xl p-1 animate-fadeIn">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={isDeleting}
                  className="px-2 py-1 text-slate-400 hover:text-slate-200 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors border border-white/[0.04]"
                title="Delete item from library"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Right Actions: External Link & Close */}
          <div className="flex items-center gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/[0.08] transition-colors"
            >
              <span>Open Source Video</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors border border-white/[0.08]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
