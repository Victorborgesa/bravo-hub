// Reconstrução vetorial do símbolo Bravo Visuals a partir do site.
// Trocar pelo arquivo oficial do logo quando estiver disponível.
export function BravoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="40" cy="32" r="22" fill="#e9e9e7" />
      <circle cx="31" cy="32" r="19" fill="none" stroke="#c4c4c2" strokeWidth="5" />
      <ellipse cx="22" cy="32" rx="10.5" ry="18.5" fill="none" stroke="#8e8e8c" strokeWidth="4.5" />
      <rect x="2" y="12" width="6" height="40" rx="3" fill="#8e8e8c" />
    </svg>
  );
}

export function BravoLogo({ product = "HUB" }: { product?: string }) {
  return (
    <div className="logo">
      <BravoMark size={34} />
      <div className="logo-words">
        <span className="logo-name">BRAVO</span>
        <span className="logo-sub">{product}</span>
      </div>
    </div>
  );
}
