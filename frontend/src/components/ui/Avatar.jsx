const ROLE_STYLES = {
  judge: { bg: 'bg-navy', text: 'text-gold', initial: 'J' },
  counsel: { bg: 'bg-crimson', text: 'text-white', initial: 'C' },
  defense: { bg: 'bg-gold', text: 'text-navy', initial: 'D' },
  cocounsel: { bg: 'bg-emerald-700', text: 'text-white', initial: 'CC' },
};

export default function Avatar({ role, size = 'w-6 h-6' }) {
  const style = ROLE_STYLES[role] || ROLE_STYLES.counsel;
  return (
    <div
      className={`${size} rounded-full ${style.bg} ${style.text} flex items-center justify-center text-xs font-bold shrink-0`}
    >
      {style.initial}
    </div>
  );
}
