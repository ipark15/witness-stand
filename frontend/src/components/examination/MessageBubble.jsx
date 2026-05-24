import Avatar from '../ui/Avatar.jsx';

function renderContent(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

export default function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 mb-1.5 justify-end">
            <span className="font-sans text-xs text-ink/40">Defense Counsel</span>
            <Avatar role="defense" />
          </div>
          <div className="rounded-xl rounded-tr-sm px-4 py-3 bg-white/70 border border-gold/30 shadow-sm">
            <p className="font-serif text-ink text-[15px] leading-relaxed">{msg.content}</p>
          </div>
        </div>
      </div>
    );
  }

  if (msg.speakerRole === 'cocounsel') {
    return (
      <div className="flex justify-center">
        <div className="max-w-lg w-full">
          <div className="flex items-center gap-2 mb-1.5 justify-center">
            <Avatar role="cocounsel" size="w-5 h-5" />
            <span className="font-sans text-xs text-emerald-700/70 italic">Co-Counsel — Private</span>
            <span className="font-sans text-xs text-ink/30">(private)</span>
          </div>
          <div className="rounded-xl px-4 py-3 border border-emerald-700/25 bg-emerald-50/60 shadow-sm">
            <p className="font-serif text-ink/80 text-[14px] leading-relaxed italic">{msg.content}</p>
          </div>
        </div>
      </div>
    );
  }

  const isJudge = msg.speakerRole === 'judge';
  return (
    <div className="flex justify-start">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-1.5">
          <Avatar role={isJudge ? 'judge' : 'counsel'} />
          <span className="font-sans text-xs text-ink/40">
            {isJudge ? 'The Honorable Court' : 'Opposing Counsel'}
          </span>
        </div>
        <div
          className={`rounded-xl rounded-tl-sm px-4 py-3 border shadow-sm ${
            isJudge
              ? 'bg-navy/6 border-navy/20'
              : 'bg-crimson/5 border-crimson/20'
          }`}
        >
          <p className="font-serif text-ink text-[15px] leading-relaxed">{renderContent(msg.content)}</p>
        </div>
      </div>
    </div>
  );
}
