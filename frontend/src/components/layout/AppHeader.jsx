export default function AppHeader({ subtitle, children }) {
  return (
    <header className="bg-navy px-8 py-5 flex items-center justify-between shadow-md shrink-0">
      <div>
        <h1 className="text-gold font-serif text-2xl tracking-widest uppercase">
          Oyez
        </h1>
        {subtitle && (
          <p className="text-parchment/50 font-sans text-xs tracking-widest uppercase mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </header>
  );
}
