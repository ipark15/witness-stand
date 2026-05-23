import { useState } from 'react';
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
};

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

function NodeRow({ node }) {
  const statusCfg = STATUS_CONFIG[node.status] || STATUS_CONFIG.pending;
  const isCovered = node.status === 'covered';

  return (
    <div
      className={`flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors ${
        isCovered ? 'bg-green-50/40' : ''
      }`}
    >
      <span className={`text-lg mt-0.5 shrink-0 ${statusCfg.color}`}>{statusCfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {node.category && <CategoryBadge category={node.category} />}
          <span
            className={`font-serif text-sm ${isCovered ? 'text-ink/50 line-through' : 'text-ink'}`}
          >
            {node.label}
          </span>
        </div>
        {node.prompt_hint && (
          <p className={`font-sans text-xs mt-1 leading-relaxed ${isCovered ? 'text-ink/30' : 'text-ink/50'} italic`}>
            {node.prompt_hint}
          </p>
        )}
      </div>
    </div>
  );
}

function MatterCard({ matter, isCurrent, index }) {
  const [expanded, setExpanded] = useState(isCurrent);
  const allCovered = matter.children.every((c) => c.status === 'covered');
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
              <NodeRow key={node.id} node={node} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CaseFileView({ caseFile, evaluationFeedback, currentSubtopicIndex }) {
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

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-serif text-2xl text-ink">Case File</h2>
        <div className="flex items-center gap-3 font-sans text-xs text-ink/50">
          <span className="text-green-600 font-semibold">{coveredNodes} covered</span>
          {partialNodes > 0 && <span className="text-gold font-semibold">{partialNodes} partial</span>}
          <span className="text-ink/30">{totalNodes - coveredNodes - partialNodes} remaining</span>
        </div>
      </div>
      <p className="font-sans text-xs text-ink/40 mb-6 uppercase tracking-widest">
        {caseFile.topic} — Examination Agenda
      </p>

      <div className="space-y-3">
        {caseFile.matters.map((matter, i) => (
          <MatterCard
            key={matter.id}
            matter={matter}
            index={i}
            isCurrent={i === currentSubtopicIndex}
          />
        ))}
      </div>

      {evaluationFeedback && (
        <div className="mt-6 border border-gold/30 bg-gold/5 rounded-xl px-5 py-4">
          <SectionHeading className="mb-2">Evaluator Feedback</SectionHeading>
          <p className="font-serif text-sm text-ink/70 leading-relaxed italic">
            {evaluationFeedback}
          </p>
        </div>
      )}
    </div>
  );
}
