// Crosshair + dashed circle sized to the region the color estimator samples,
// so a disc framed inside the circle is read accurately. Used live over the
// camera preview on the companion site, and over the chosen photo in the
// Shopify admin (where the browser blocks camera access inside the iframe).
export function CenteringGuide() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <g stroke="white" strokeWidth="0.6" opacity="0.9">
          <line x1="50" y1="30" x2="50" y2="44" />
          <line x1="50" y1="56" x2="50" y2="70" />
          <line x1="30" y1="50" x2="44" y2="50" />
          <line x1="56" y1="50" x2="70" y2="50" />
          <circle cx="50" cy="50" r="28" fill="none" strokeDasharray="3 2" />
        </g>
        <g stroke="black" strokeWidth="0.15" opacity="0.5">
          <circle cx="50" cy="50" r="28" fill="none" />
        </g>
      </svg>
    </div>
  );
}
