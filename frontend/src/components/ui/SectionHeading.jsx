export default function SectionHeading({ children, className = '' }) {
  return (
    <h3 className={`font-sans text-xs text-ink/45 uppercase tracking-widest ${className}`}>
      {children}
    </h3>
  );
}
