import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  totalMatches?: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search by title, tags, takeaways, tools, or transcript...',
  isLoading = false,
  totalMatches,
}) => {
  const [localValue, setLocalValue] = useState<string>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal state when external value changes (e.g. when reset by clear all)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce user keystrokes by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localValue, value, onChange]);

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  const hasQuery = localValue.trim().length > 0;

  return (
    <div className="relative w-full" role="search">
      <div className="relative flex items-center">
        {/* Left Search Icon / Spinner */}
        <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>

        {/* Search Input */}
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Search saved knowledge"
          className="w-full pl-10 pr-24 py-2.5 bg-slate-900/80 hover:bg-slate-900 focus:bg-slate-900 border border-white/[0.08] focus:border-emerald-500/50 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-inner"
        />

        {/* Right Controls: Match count badge & Clear Button */}
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {hasQuery && totalMatches !== undefined && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hidden sm:inline-block">
              {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
            </span>
          )}

          {hasQuery && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search input"
              title="Clear search (Esc)"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
