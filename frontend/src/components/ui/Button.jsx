const VARIANTS = {
  primary:
    'bg-navy text-gold border border-gold/30 hover:bg-navy/90 shadow',
  secondary:
    'border border-ink/20 text-ink/55 hover:border-gold hover:text-ink',
  cocounsel:
    'text-emerald-700 border border-emerald-700/30 hover:bg-emerald-50',
};

export default function Button({
  variant = 'primary',
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={`font-sans text-sm tracking-wide rounded-lg px-4 py-2.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
