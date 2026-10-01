/* INLINE SVG STAND-IN PHOTOS (no network requests, no bitmap assets) */

import type { ReactElement } from 'react';
import type { PhotoKey } from './photoKeys';
import { photoLabels } from './photoKeys';

const C = {
  crust: '#c9762b',
  crustDark: '#a35c1d',
  crumb: '#f0d9b8',
  leaf: '#3f8f52',
  leafDark: '#2c6b3c',
  tomato: '#c1462f',
  cream: '#faf6f0',
  ink: '#2e2a26',
  stone: '#8a8177',
  card: '#e8ddcc',
};

function Bread() {
  return (
    <>
      <ellipse cx="62" cy="72" rx="40" ry="24" fill={C.crust} />
      <ellipse cx="62" cy="66" rx="40" ry="22" fill="#dd8c3f" />
      <path d="M34 60q14-10 28 0t28 0" stroke={C.crustDark} strokeWidth="3" fill="none" />
      <ellipse cx="112" cy="80" rx="22" ry="14" fill={C.crust} />
      <ellipse cx="112" cy="76" rx="22" ry="13" fill="#e69a52" />
      <path d="M100 72q12-7 24 0" stroke={C.crustDark} strokeWidth="2.5" fill="none" />
      <ellipse cx="120" cy="50" rx="15" ry="10" fill="#e0913f" />
      <ellipse cx="120" cy="47" rx="15" ry="9" fill="#eda75f" />
    </>
  );
}

function Produce() {
  return (
    <>
      <circle cx="52" cy="72" r="26" fill={C.leaf} />
      <path d="M52 46q-8 12 0 26 8-14 0-26z" fill={C.leafDark} />
      <circle cx="100" cy="80" r="18" fill={C.tomato} />
      <path d="M100 62q-5 3-8 1 3 5 8 4 5 1 8-4-3 2-8-1z" fill={C.leafDark} />
      <ellipse cx="126" cy="60" rx="12" ry="20" transform="rotate(24 126 60)" fill="#e08b2a" />
      <path d="M118 40q4-10 12-12-4 10-12 12z" fill={C.leafDark} />
      <circle cx="76" cy="44" r="13" fill="#e3b23c" />
    </>
  );
}

function Dairy() {
  return (
    <>
      <path d="M46 44h30v50a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6z" fill={C.cream} stroke={C.stone} strokeWidth="2" />
      <path d="M52 26h18v18H52z" fill={C.cream} stroke={C.stone} strokeWidth="2" />
      <rect x="46" y="60" width="30" height="16" fill="#7fb4d8" />
      <path d="M92 56h34v38a6 6 0 0 1-6 6H98a6 6 0 0 1-6-6z" fill="#f3ede4" stroke={C.stone} strokeWidth="2" />
      <ellipse cx="109" cy="56" rx="17" ry="6" fill={C.cream} stroke={C.stone} strokeWidth="2" />
      <rect x="92" y="70" width="34" height="12" fill={C.tomato} opacity="0.75" />
    </>
  );
}

function Prepared() {
  return (
    <>
      <rect x="24" y="42" width="112" height="56" rx="6" fill={C.card} stroke={C.stone} strokeWidth="2" />
      <rect x="32" y="50" width="46" height="40" rx="3" fill="#e8a34d" />
      <rect x="84" y="50" width="20" height="18" rx="3" fill={C.leaf} />
      <rect x="84" y="72" width="20" height="18" rx="3" fill={C.tomato} />
      <rect x="110" y="50" width="18" height="40" rx="3" fill="#f0e2c4" />
      <path d="M24 42h112" stroke={C.stone} strokeWidth="2" />
      <rect x="20" y="36" width="120" height="8" rx="4" fill="#d6cab6" />
    </>
  );
}

function Dry() {
  return (
    <>
      <path d="M30 52q14-8 28 0v42a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4z" fill="#d9c9ab" stroke={C.stone} strokeWidth="2" />
      <rect x="34" y="64" width="20" height="14" fill={C.crust} opacity="0.8" />
      <rect x="70" y="50" width="26" height="48" rx="3" fill="#b8c4cc" stroke={C.stone} strokeWidth="2" />
      <rect x="70" y="64" width="26" height="16" fill={C.tomato} />
      <rect x="104" y="60" width="26" height="38" rx="3" fill="#c3ccd2" stroke={C.stone} strokeWidth="2" />
      <rect x="104" y="72" width="26" height="14" fill={C.leaf} />
      <ellipse cx="83" cy="50" rx="13" ry="4" fill="#cdd6dc" stroke={C.stone} strokeWidth="2" />
      <ellipse cx="117" cy="60" rx="13" ry="4" fill="#cdd6dc" stroke={C.stone} strokeWidth="2" />
    </>
  );
}

function Mixed() {
  return (
    <>
      <circle cx="60" cy="56" r="15" fill={C.leaf} />
      <circle cx="90" cy="52" r="12" fill={C.tomato} />
      <ellipse cx="112" cy="58" rx="14" ry="9" fill={C.crust} />
      <path d="M28 64h104l-8 34a5 5 0 0 1-5 4H41a5 5 0 0 1-5-4z" fill="#c89a5e" />
      <path d="M28 64h104l-2 9H30z" fill="#dcae70" />
      <path d="M48 73l4 29M78 73v29M108 73l-4 29" stroke="#a97e46" strokeWidth="2.5" />
    </>
  );
}

const shapes: Record<PhotoKey, () => ReactElement> = {
  bread: Bread,
  produce: Produce,
  dairy: Dairy,
  prepared: Prepared,
  dry: Dry,
  mixed: Mixed,
};

export function FoodPhoto({
  photo,
  className,
  alt,
}: {
  photo: string | null;
  className?: string;
  alt?: string;
}) {
  const key = (photo && photo in shapes ? photo : 'mixed') as PhotoKey;
  const Shape = shapes[key];
  const label = alt ?? photoLabels[key];

  if (!photo) {
    return (
      <div className={`foodphoto foodphoto--none ${className ?? ''}`} role="img" aria-label="No photograph">
        <span aria-hidden="true">No photo</span>
      </div>
    );
  }

  return (
    <svg
      className={`foodphoto ${className ?? ''}`}
      viewBox="0 0 160 120"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="160" height="120" fill="#f3ede4" />
      <Shape />
    </svg>
  );
}
