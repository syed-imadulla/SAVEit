import React, { useState } from 'react';
import {
  FileText,
  ScanText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  Code2,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  IRawEvidence,
  IResource,
  IEvidenceReference,
} from '../types/item';

interface EvidenceInspectorProps {
  rawEvidence?: IRawEvidence;
  keyPoints: string[];
  resources: IResource[];
}

type TabType = 'attributions' | 'transcript' | 'ocr' | 'diagnostics';

function formatTimestamp(seconds?: number, ms?: number): string {
  if (typeof seconds === 'number') {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} (${seconds.toFixed(1)}s)`;
  }
  if (typeof ms === 'number') {
    const sec = ms / 1000;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} (${ms}ms)`;
  }
  return 'Approximate';
}

export const EvidenceInspector: React.FC<EvidenceInspectorProps> = ({
  rawEvidence,
  keyPoints,
  resources,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('attributions');

  const attributions = rawEvidence?.evidenceAttributions || [];
  const segments = rawEvidence?.transcriptSegments || [];
  const ocrObservations = rawEvidence?.ocrObservations || [];

  // Helper to find attribution for keyPoint
  const getKeyPointAttribution = (index: number): IEvidenceReference | undefined => {
    return attributions.find(
      (a) => a.targetType === 'keyPoint' && a.targetIndex === index
    );
  };

  // Helper to find attribution for resource
  const getResourceAttribution = (index: number, resourceName: string): IEvidenceReference | undefined => {
    return (
      resources[index]?.evidence ||
      attributions.find(
        (a) =>
          a.targetType === 'resource' &&
          (a.targetIndex === index || (a.targetText && a.targetText.toLowerCase() === resourceName.toLowerCase()))
      )
    );
  };

  return (
    <div className="w-full bg-slate-900/60 rounded-2xl border border-white/[0.08] overflow-hidden">
      {/* Evidence Inspector Tabs Header */}
      <div className="flex items-center gap-1 p-2 bg-slate-950/60 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('attributions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
            activeTab === 'attributions'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Grounding Attributions</span>
          {attributions.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200">
              {attributions.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transcript')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
            activeTab === 'transcript'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Spoken Transcript</span>
          {segments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
              {segments.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ocr')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
            activeTab === 'ocr'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <ScanText className="w-3.5 h-3.5" />
          <span>Visual OCR</span>
          {ocrObservations.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
              {ocrObservations.length}
            </span>
          )}
        </button>

        {rawEvidence?.failureReason && (
          <button
            type="button"
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === 'diagnostics'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-amber-400/80 hover:text-amber-300 hover:bg-white/[0.04]'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Diagnostics</span>
          </button>
        )}
      </div>

      {/* Tab 1: Grounding Attributions */}
      {activeTab === 'attributions' && (
        <div className="p-4 sm:p-5 space-y-6">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/10 text-xs text-slate-300">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Every key takeaway and discovered tool is audited against raw transcript excerpts and visual OCR frame captures.
              Grounded findings link directly to exact video timestamps.
            </p>
          </div>

          {/* Key Takeaways Grounding */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Takeaway Grounding ({keyPoints.length})
            </h4>

            {keyPoints.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No key takeaways extracted yet.</p>
            ) : (
              <div className="space-y-3">
                {keyPoints.map((point, idx) => {
                  const attr = getKeyPointAttribution(idx);
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-950/40 border border-white/[0.06] space-y-2 hover:border-white/[0.12] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
                          {point}
                        </p>

                        {/* Grounding Chip */}
                        {attr ? (
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                              attr.sourceType === 'transcript'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : attr.sourceType === 'ocr'
                                ? 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                                : 'bg-slate-800 text-slate-300 border-white/[0.08]'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>
                              {attr.sourceType === 'transcript'
                                ? `Transcript @ ${formatTimestamp(attr.timestampSeconds, attr.timestampMs)}`
                                : attr.sourceType === 'ocr'
                                ? `Frame OCR @ ${formatTimestamp(attr.timestampSeconds, attr.timestampMs)}`
                                : 'Metadata Evidence'}
                            </span>
                          </span>
                        ) : (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-white/[0.06]">
                            <span>Ungrounded Insight</span>
                          </span>
                        )}
                      </div>

                      {/* Verbatim Excerpt if grounded */}
                      {attr?.excerpt && (
                        <div className="pt-2 border-t border-white/[0.04] text-[11px] text-slate-400">
                          <span className="text-slate-500 font-medium">Verbatim source excerpt: </span>
                          <span className="italic text-slate-300">"{attr.excerpt}"</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resources Grounding */}
          {resources.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Resource Evidence ({resources.length})
              </h4>
              <div className="space-y-3">
                {resources.map((resource, idx) => {
                  const attr = getResourceAttribution(idx, resource.name);
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-950/40 border border-white/[0.06] space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-200">
                            {resource.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/[0.06]">
                            {resource.type}
                          </span>
                        </div>

                        {attr ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-medium bg-teal-500/10 text-teal-300 border border-teal-500/30">
                            <Clock className="w-3 h-3" />
                            <span>
                              {attr.sourceType === 'transcript'
                                ? `Spoken @ ${formatTimestamp(attr.timestampSeconds, attr.timestampMs)}`
                                : attr.sourceType === 'ocr'
                                ? `On-Screen OCR @ ${formatTimestamp(attr.timestampSeconds, attr.timestampMs)}`
                                : 'Metadata'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">
                            Extracted from video content
                          </span>
                        )}
                      </div>

                      {resource.url && (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 truncate max-w-full"
                        >
                          <span className="truncate">{resource.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      )}

                      {attr?.excerpt && (
                        <div className="pt-1.5 border-t border-white/[0.04] text-[11px] text-slate-400">
                          <span className="text-slate-500 font-medium">Mention evidence: </span>
                          <span className="italic text-slate-300">"{attr.excerpt}"</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Spoken Transcript */}
      {activeTab === 'transcript' && (
        <div className="p-4 sm:p-5">
          {segments.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {segments.map((seg, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-950/30 hover:bg-slate-950/70 border border-white/[0.04] transition-colors"
                >
                  <span className="shrink-0 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400">
                    {formatTimestamp(seg.start)}
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">{seg.text}</p>
                </div>
              ))}
            </div>
          ) : rawEvidence?.transcript ? (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-white/[0.06] text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {rawEvidence.transcript}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
              <FileText className="w-8 h-8 mb-2 opacity-60" />
              <p className="text-xs">No native transcript or speech audio was available for this item.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Visual OCR Observations */}
      {activeTab === 'ocr' && (
        <div className="p-4 sm:p-5">
          {ocrObservations.length > 0 ? (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {ocrObservations.map((obs, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950/40 border border-white/[0.06] space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">
                      Frame #{obs.frameIndex}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                      {formatTimestamp(undefined, obs.timestampMs)}
                    </span>
                  </div>

                  {/* Terminal Commands */}
                  {obs.terminalCommands && obs.terminalCommands.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <Terminal className="w-3 h-3 text-emerald-400" />
                        Terminal Command
                      </span>
                      {obs.terminalCommands.map((cmd, cIdx) => (
                        <div
                          key={cIdx}
                          className="font-mono text-xs px-2.5 py-1.5 rounded-lg bg-black/60 text-emerald-300 border border-emerald-500/20 overflow-x-auto"
                        >
                          $ {cmd}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Code Snippets */}
                  {obs.codeSnippets && obs.codeSnippets.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <Code2 className="w-3 h-3 text-cyan-400" />
                        Code Snippet
                      </span>
                      {obs.codeSnippets.map((code, sIdx) => (
                        <pre
                          key={sIdx}
                          className="font-mono text-xs p-2 rounded-lg bg-black/60 text-slate-200 border border-white/[0.08] overflow-x-auto"
                        >
                          {code}
                        </pre>
                      ))}
                    </div>
                  )}

                  {/* Raw OCR text excerpt */}
                  {obs.rawText && (
                    <div className="text-[11px] text-slate-400 pt-1 border-t border-white/[0.04]">
                      <span className="text-slate-500">Detected on screen: </span>
                      <span className="text-slate-300">{obs.rawText}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : rawEvidence?.ocrText ? (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-white/[0.06] text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {rawEvidence.ocrText}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
              <ScanText className="w-8 h-8 mb-2 opacity-60" />
              <p className="text-xs">No visual frame OCR or on-screen text was extracted for this video.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Diagnostics */}
      {activeTab === 'diagnostics' && rawEvidence?.failureReason && (
        <div className="p-4 sm:p-5 space-y-3">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>Extraction Diagnostics</span>
            </div>
            <p className="leading-relaxed">{rawEvidence.failureReason}</p>
          </div>
          {rawEvidence.notes && (
            <p className="text-xs text-slate-400 leading-relaxed">{rawEvidence.notes}</p>
          )}
        </div>
      )}
    </div>
  );
};
