import { useState, useEffect, useRef, useCallback } from 'react';
import useSessionStore from '../../store/sessionStore.js';
import SectionHeading from '../ui/SectionHeading.jsx';

const CATEGORY_STYLES = {
  motivation: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  definition: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  mechanism: { bg: 'bg-navy/5', border: 'border-navy/20', text: 'text-navy' },
  example: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  tradeoff: { bg: 'bg-crimson/5', border: 'border-crimson/20', text: 'text-crimson' },
  distinction: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
};

const STATUS_CONFIG = {
  pending: { icon: '○', color: 'text-ink/25', label: 'Pending' },
  partial: { icon: '◐', color: 'text-gold', label: 'Partial' },
  covered: { icon: '✓', color: 'text-green-600', label: 'Covered' },
  skipped: { icon: '⊘', color: 'text-ink/35', label: 'Skipped' },
};

const HOLD_DURATION_MS = 2000;

function StatusDots({ children }) {
  return (
    <div className="flex gap-1">
      {children.map((node, i) => {
        const cfg = STATUS_CONFIG[node.status] || STATUS_CONFIG.pending;
        return (
          <span key={i} className={`text-sm ${cfg.color}`} title={`${node.label}: ${cfg.label}`}>
            {cfg.icon}
          </span>
        );
      })}
    </div>
  );
}

function CategoryBadge({ category }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.mechanism;
  return (
    <span
      className={`inline-block font-sans text-[10px] px-1.5 py-0.5 rounded border ${style.bg} ${style.border} ${style.text} uppercase tracking-wider`}
    >
      {category}
    </span>
  );
}

function HoldToRevealButton({ nodeId }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const frameRef = useRef(null);
  const store = useSessionStore;

  const tick = useCallback(() => {
    if (!startRef.current) return;
    const elapsed = Date.now() - startRef.current;
    const pct = Math.min(elapsed / HOLD_DURATION_MS, 1);
    setProgress(pct);
    if (pct >= 1) {
      store.getState().skipNode(nodeId);
      cancel();
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [nodeId]);

  const cancel = useCallback(() => {
    setHolding(false);
    setProgress(0);
    startRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const begin = useCallback(() => {
    if (startRef.current) return;
    setHolding(true);
    startRef.current = Date.now();
    frameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => () => cancel(), [cancel]);

  return (
    <button
      onMouseDown={begin}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={begin}
      onTouchEnd={cancel}
      className="relative mt-1.5 font-sans text-[10px] px-2 py-1 rounded border border-ink/15 text-ink/40 hover:text-ink/60 hover:border-ink/25 transition-colors overflow-hidden select-none"
      title="Hold for 2 seconds to reveal the answer (marks as skipped)"
    >
      {holding && (
        <span
          className="absolute inset-0 bg-crimson/10 origin-left transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      )}
      {/* Stack both labels in the same grid cell so the button width is always
          fixed to the wider label ("Reveal Answer") — prevents the button from
          shrinking mid-hold and slipping out from under the cursor. */}
      <span className="relative grid leading-none">
        <span className={`col-start-1 row-start-1 ${holding ? 'invisible' : ''}`}>Reveal Answer</span>
        <span className={`col-start-1 row-start-1 ${holding ? '' : 'invisible'}`}>Hold…</span>
      </span>
    </button>
  );
}

function NodeRow({ node, readOnly }) {
  const statusCfg = STATUS_CONFIG[node.status] || STATUS_CONFIG.pending;
  const isCovered = node.status === 'covered';
  const isSkipped = node.status === 'skipped';
  const isDone = isCovered || isSkipped;
  // In review mode the case is closed: never offer Hold-to-Reveal (it would
  // mutate the global session store which isn't even mounted on the Review
  // page). Instead, disclose the answer key inline for any node that has
  // one, so reviewers can compare their performance against the rubric.
  const canReveal = !readOnly && !isDone && node.answer_key;
  const reviewAnswer = readOnly && (isCovered || (!isSkipped && node.answer_key))
    ? node.answer_key
    : null;

  return (
    <div
      className={`flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors ${
        isCovered ? 'bg-green-50/40' : isSkipped ? 'bg-ink/[0.03]' : ''
      }`}
    >
      <span className={`text-lg mt-0.5 shrink-0 ${statusCfg.color}`}>{statusCfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {node.category && <CategoryBadge category={node.category} />}
          <span
            className={`font-serif text-sm ${
              isSkipped ? 'text-ink/40 line-through' : isCovered ? 'text-ink/50 line-through' : 'text-ink'
            }`}
          >
            {node.label}
          </span>
          {isSkipped && (
            <span className="font-sans text-[9px] px-1.5 py-0.5 rounded bg-ink/5 text-ink/30 uppercase tracking-wider">
              skipped
            </span>
          )}
        </div>
        {node.prompt_hint && (
          <p className={`font-sans text-xs mt-1 leading-relaxed ${isDone ? 'text-ink/30' : 'text-ink/50'} italic`}>
            {node.prompt_hint}
          </p>
        )}
        {isSkipped && node.revealed_answer && (
          <div className="mt-1.5 font-sans text-xs text-ink/50 bg-ink/[0.03] border border-ink/8 rounded px-2 py-1.5 leading-relaxed">
            {node.revealed_answer}
          </div>
        )}
        {reviewAnswer && (
          <div className="mt-1.5 font-sans text-xs text-ink/55 bg-green-50/50 border border-green-200/60 rounded px-2 py-1.5 leading-relaxed">
            <span className="font-sans text-[9px] uppercase tracking-wider text-green-700/60 block mb-0.5">
              Expected answer
            </span>
            {reviewAnswer}
          </div>
        )}
        {canReveal && <HoldToRevealButton nodeId={node.id} />}
      </div>
    </div>
  );
}

function MatterCard({ matter, isCurrent, index, readOnly }) {
  const [expanded, setExpanded] = useState(isCurrent);
  useEffect(() => { if (isCurrent) setExpanded(true); }, [isCurrent]);
  const allDone = matter.children.every((c) => c.status === 'covered' || c.status === 'skipped');
  const allCovered = allDone && matter.children.every((c) => c.status === 'covered');
  const anyProgress = matter.children.some((c) => c.status !== 'pending');

  const borderColor = allCovered
    ? 'border-green-300/60'
    : isCurrent
    ? 'border-navy/30'
    : 'border-ink/10';

  const bgColor = allCovered
    ? 'bg-green-50/30'
    : isCurrent
    ? 'bg-white/60'
    : 'bg-white/30';

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${borderColor} ${bgColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`font-sans text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              allCovered
                ? 'bg-green-100 text-green-700'
                : isCurrent
                ? 'bg-navy text-parchment'
                : anyProgress
                ? 'bg-gold/20 text-gold'
                : 'bg-ink/10 text-ink/40'
            }`}
          >
            {allCovered ? '✓' : index + 1}
          </span>
          <span
            className={`font-serif text-sm truncate ${
              isCurrent ? 'text-navy font-semibold' : allCovered ? 'text-green-700' : 'text-ink/70'
            }`}
          >
            {matter.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusDots>{matter.children}</StatusDots>
          <svg
            className={`w-4 h-4 text-ink/30 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-ink/5">
          <div className="mt-1 space-y-0.5">
            {matter.children.map((node) => (
              <NodeRow key={node.id} node={node} readOnly={readOnly} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CaseFileView({ caseFile, evaluationFeedback, currentSubtopicIndex, compact, readOnly }) {
  if (!caseFile) {
    return (
      <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-3">📋</div>
          <p className="font-serif text-ink/40 italic">Preparing case file…</p>
          <p className="font-sans text-xs text-ink/30 mt-1">
            The structured examination agenda will appear here once generated.
          </p>
        </div>
      </div>
    );
  }

  const totalNodes = caseFile.matters.reduce((sum, m) => sum + m.children.length, 0);
  const coveredNodes = caseFile.matters.reduce(
    (sum, m) => sum + m.children.filter((c) => c.status === 'covered').length,
    0
  );
  const partialNodes = caseFile.matters.reduce(
    (sum, m) => sum + m.children.filter((c) => c.status === 'partial').length,
    0
  );
  const skippedNodes = caseFile.matters.reduce(
    (sum, m) => sum + m.children.filter((c) => c.status === 'skipped').length,
    0
  );
  const remaining = totalNodes - coveredNodes - partialNodes - skippedNodes;

  const padding = compact ? 'p-4' : 'p-8';

  return (
    <div className={`flex-1 overflow-y-auto ${padding}`}>
      <div className="flex items-start justify-between mb-1">
        <h2 className={`font-serif text-ink ${compact ? 'text-lg' : 'text-2xl'}`}>Case File</h2>
        <div className={`flex items-center gap-2 font-sans text-ink/50 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          <span className="text-green-600 font-semibold">{coveredNodes} covered</span>
          {skippedNodes > 0 && <span className="text-ink/35 font-semibold">{skippedNodes} skipped</span>}
          {partialNodes > 0 && <span className="text-gold font-semibold">{partialNodes} partial</span>}
          <span className="text-ink/30">{remaining} remaining</span>
        </div>
      </div>
      <p className={`font-sans text-ink/40 uppercase tracking-widest ${compact ? 'text-[10px] mb-4' : 'text-xs mb-6'}`}>
        {caseFile.topic} — Examination Agenda
      </p>

      <div className="space-y-2">
        {caseFile.matters.map((matter, i) => (
          <MatterCard
            key={matter.id}
            matter={matter}
            index={i}
            isCurrent={i === currentSubtopicIndex}
            readOnly={readOnly}
          />
        ))}
      </div>

      {evaluationFeedback && (
        <div className={`border border-gold/30 bg-gold/5 rounded-xl ${compact ? 'mt-4 px-3 py-2.5' : 'mt-6 px-5 py-4'}`}>
          <SectionHeading className="mb-1">Evaluator Feedback</SectionHeading>
          <p className={`font-serif text-ink/70 leading-relaxed italic ${compact ? 'text-xs' : 'text-sm'}`}>
            {evaluationFeedback}
          </p>
        </div>
      )}
    </div>
  );
}
