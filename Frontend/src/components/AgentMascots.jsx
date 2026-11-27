import { useEffect, useRef } from 'react';

const VALID_MOODS = new Set(['idle', 'happy', 'sad', 'shy']);

const MOUTH_PATHS = {
  idle: 'M -10 0 Q 0 5.5 10 0',
  happy: 'M -14 -2 Q 0 14 14 -2 Z',
  sad: 'M -11 6 Q 0 -5 11 6',
  shy: 'M -4.5 2 A 4.5 4.5 0 1 0 4.5 2 A 4.5 4.5 0 1 0 -4.5 2',
};

const CREATURES = [
  {
    id: 'scholar',
    label: 'Tall Scholar Agent',
    pivot: '218px 322px',
    breatheClass: 'rg-breathe-0',
    baseTilt: 0,
    bodyPath: 'M 146 322 L 146 86 Q 146 38 194 38 L 242 38 Q 290 38 290 86 L 290 322 Z',
    rimPath: 'M 149 92 Q 149 41 194 41 L 242 41 Q 287 41 287 92',
    fillUrl: 'url(#rgGradViolet)',
    useShadow: false,
    faceX: 218,
    faceY: 118,
    eyeDx: 26,
    eyeDy: -6,
    eyeR: 16,
    pupilR: 7.4,
    browY: -25,
    browStroke: '#EDE9FE',
    mouthY: 25,
    mouthStroke: '#EDE9FE',
    happyFill: '#2E1065',
    blushDx: 42,
    blushY: 15,
    blushFill: '#FDA4AF',
  },
  {
    id: 'dome',
    label: 'Friendly Dome Agent',
    pivot: '143px 322px',
    breatheClass: 'rg-breathe-1',
    baseTilt: 0,
    bodyPath: 'M 44 322 C 44 206 78 154 143 154 C 208 154 242 206 242 322 Z',
    rimPath: 'M 54 274 C 66 190 96 158 143 158 C 190 158 220 190 232 274',
    fillUrl: 'url(#rgGradAmber)',
    useShadow: true,
    faceX: 143,
    faceY: 242,
    eyeDx: 26,
    eyeDy: -6,
    eyeR: 16,
    pupilR: 7.4,
    browY: -25,
    browStroke: '#1C1917',
    mouthY: 24,
    mouthStroke: '#1C1917',
    happyFill: '#451A03',
    blushDx: 42,
    blushY: 14,
    blushFill: '#FB7185',
  },
  {
    id: 'debugger',
    label: 'Sharp Debugger Agent',
    pivot: '328px 322px',
    breatheClass: 'rg-breathe-2',
    baseTilt: -2.5,
    bodyPath: 'M 254 322 L 254 188 A 74 74 0 0 1 402 188 L 402 322 Z',
    rimPath: 'M 258 192 A 70 70 0 0 1 398 192',
    fillUrl: 'url(#rgGradEmerald)',
    useShadow: true,
    faceX: 328,
    faceY: 206,
    eyeDx: 24,
    eyeDy: -6,
    eyeR: 15,
    pupilR: 7,
    browY: -24,
    browStroke: '#06281E',
    mouthY: 23,
    mouthStroke: '#06281E',
    happyFill: '#022C22',
    blushDx: 39,
    blushY: 13,
    blushFill: '#FDA4AF',
  },
];

export function AgentMascots({ mood = 'idle', className = '' }) {
  const svgRef = useRef(null);
  const resolvedMood = VALID_MOODS.has(mood) ? mood : 'idle';

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;

    const resetLook = () => {
      el.style.setProperty('--pupil-x', '0px');
      el.style.setProperty('--pupil-y', '0px');
      el.style.setProperty('--face-x', '0px');
      el.style.setProperty('--face-y', '0px');
      el.style.setProperty('--body-lean', '0deg');
    };

    const handleMouseMove = (e) => {
      if (resolvedMood === 'shy') return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const angle = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      const norm = Math.min(dist / 320, 1);

      const pupilX = Math.cos(angle) * norm * 7;
      const pupilY = Math.sin(angle) * norm * 7;
      const faceX = Math.cos(angle) * norm * 5;
      const faceY = Math.sin(angle) * norm * 4.5;
      const bodyLean = Math.cos(angle) * norm * 2.5;

      el.style.setProperty('--pupil-x', `${pupilX.toFixed(2)}px`);
      el.style.setProperty('--pupil-y', `${pupilY.toFixed(2)}px`);
      el.style.setProperty('--face-x', `${faceX.toFixed(2)}px`);
      el.style.setProperty('--face-y', `${faceY.toFixed(2)}px`);
      el.style.setProperty('--body-lean', `${bodyLean.toFixed(2)}deg`);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('blur', resetLook);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('blur', resetLook);
    };
  }, [resolvedMood]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 460 360"
      className={`rg-mascots mood-${resolvedMood} ${className}`.trim()}
      role="img"
      aria-label="ResearchGraph agent mascots"
    >
      <defs>
        <linearGradient id="rgGradViolet" x1="0.1" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="45%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>

        <linearGradient id="rgGradAmber" x1="0.15" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        <linearGradient id="rgGradEmerald" x1="0.15" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="45%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>

        <radialGradient id="rgGroundShadowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="70%" stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>

        <filter id="rgDropShadowSoft" x="-15%" y="-15%" width="135%" height="135%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#1C1917" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* Grounded Elliptical Shadow */}
      <ellipse
        cx="230"
        cy="326"
        rx="188"
        ry="17"
        className="rg-mascot-ground-shadow"
        fill="url(#rgGroundShadowGrad)"
      />

      {CREATURES.map((c) => (
        <g key={c.id} className={`rg-mascot-breathe ${c.breatheClass}`}>
          <g className="rg-mascot-mood-wrap">
            <g
              className="rg-mascot-lean"
              style={{
                transformOrigin: c.pivot,
                '--base-tilt': `${c.baseTilt}deg`,
              }}
            >
              {/* Body Silhouette + Subtle Rim Highlight */}
              <g filter={c.useShadow ? 'url(#rgDropShadowSoft)' : undefined}>
                <path
                  d={c.bodyPath}
                  fill={c.fillUrl}
                  className="rg-mascot-body-stroke"
                />
                <path
                  d={c.rimPath}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.24)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </g>

              {/* Expressive Face */}
              <g transform={`translate(${c.faceX}, ${c.faceY})`}>
                <g className="rg-mascot-face">
                  {/* Cheek Blush */}
                  <ellipse
                    cx={-c.blushDx}
                    cy={c.blushY}
                    rx="11"
                    ry="6"
                    fill={c.blushFill}
                    className="rg-mascot-blush"
                  />
                  <ellipse
                    cx={c.blushDx}
                    cy={c.blushY}
                    rx="11"
                    ry="6"
                    fill={c.blushFill}
                    className="rg-mascot-blush"
                  />

                  {/* Left & Right Eyes + Dynamic Eyebrows */}
                  {[-1, 1].map((side) => {
                    const ex = side * c.eyeDx;
                    const browClass =
                      side < 0 ? 'rg-mascot-brow rg-brow-left' : 'rg-mascot-brow rg-brow-right';
                    return (
                      <g key={side} transform={`translate(${ex}, ${c.eyeDy})`}>
                        <g transform={`translate(0, ${c.browY})`}>
                          <path
                            d="M -9 0 Q 0 -2 9 0"
                            fill="none"
                            stroke={c.browStroke}
                            strokeWidth="3.2"
                            strokeLinecap="round"
                            className={browClass}
                          />
                        </g>

                        <g className="rg-mascot-eye-scale">
                          <circle cx="0" cy="0" r={c.eyeR} fill="#FFFFFF" />
                          <g className="rg-mascot-pupil-wrap">
                            <circle cx="0" cy="0" r={c.pupilR} fill="#18181B" />
                            <circle cx="-2.4" cy="-2.4" r="2" fill="#FFFFFF" />
                          </g>
                        </g>
                      </g>
                    );
                  })}

                  {/* Mouth */}
                  <g transform={`translate(0, ${c.mouthY})`}>
                    <path
                      d={MOUTH_PATHS[resolvedMood]}
                      fill={resolvedMood === 'happy' ? c.happyFill : 'none'}
                      stroke={c.mouthStroke}
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="rg-mascot-mouth"
                    />
                    {resolvedMood === 'happy' && (
                      <path
                        d="M -6 5 Q 0 11 6 5"
                        fill="#FB7185"
                        opacity="0.9"
                      />
                    )}
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}

export default AgentMascots;
