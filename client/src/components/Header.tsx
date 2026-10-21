import React from 'react';
import { Bookmark, Sparkles, Activity } from 'lucide-react';
import { HealthResponse } from '../types/item';

interface HeaderProps {
  totalItems: number;
  health: HealthResponse | null;
}

export const Header: React.FC<HeaderProps> = ({ totalItems, health }) => {
  const isHealthy = health?.database === 'connected';

  return (
    <header className="border-b border-white/[0.06] bg-[#0A0D14]/80 backdrop-blur-md sticky top-0 z-40 transition-all">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Bookmark className="w-5 h-5 text-white fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                SAVE<span className="text-emerald-400">it</span>
              </h1>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                v1
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Share once. Extract automatically. Find it later in seconds.
            </p>
          </div>
        </div>

        {/* Status Indicators & Item Counter */}
        <div className="flex items-center gap-3">
          {/* Health Indicator */}
          <div
            title={`Backend: ${health?.status || 'checking'}, DB: ${health?.database || 'checking'}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-slate-900 border border-slate-800"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <Activity className="w-3 h-3 text-slate-400 hidden sm:block" />
            <span className="text-slate-300 font-mono text-[11px]">
              {isHealthy ? 'Live API' : 'Connecting...'}
            </span>
          </div>

          {/* Saved Items Counter */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{totalItems} {totalItems === 1 ? 'video' : 'videos'} saved</span>
          </div>
        </div>
      </div>
    </header>
  );
};
