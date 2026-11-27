import { useEffect, useRef } from 'react';

const MOUTH_PATHS = {
  idle: 'M -4 0 Q 0 1.5 4 0',
  happy: 'M -6 -1 Q 0 7 6 -1',
  sad: 'M -5 3 Q 0 -3 5 3',
  shy: 'M -3.5 0.5 L 3.5 0.5',
};

const CREATURES = [
  {
    id: 'experiment',
    label: 'Experiment Agent',
    className: 'rg-mascot-amber',
    faceX: 56,
    faceY: 66,
    eyeDx: 11,
    eyeDy: -4,
    eyeR: 7,
    pupilR: 3.1,
    mouthY: 14,
    mouthStroke: '#1C1917',
    browStroke: '#1C1917',
    bodyPath: 'M 24 130 L 24 62 A 32 32 0 0 1 88 62 L 88 130 Z',
  },
  {
    id: 'reader',
    label: 'Reader Agent',
    className: 'rg-mascot-center',
    faceX: 130,
    faceY: 56,
    eyeDx: 13,
    eyeDy: -4,
    eyeR: 7.5,
    pupilR: 3.3,
    mouthY: 16,
    mouthStroke: '#F4F4F5',
    browStroke: '#F4F4F5',
    bodyPath: 'M 93 130 L 93 38 Q 93 16 115 16 L 145 16 Q 167 16 167 38 L 167 130 Z',
  },
  {
    id: 'result',
    label: 'Result Agent',
    className: 'rg-mascot-emerald',
    faceX: 204,
    faceY: 100,
    eyeDx: 11,
    eyeDy: -4,
    eyeR: 6.5,
    pupilR: 2.9,
    mouthY: 13,
    mouthStroke: '#1C1917',
    browStroke: '#1C1917',
    bodyPath: 'M 168 130 L 168 102 A 36 36 0 0 1 240 102 L 240 130 Z',
  },
];

export function AgentMascots({ mood = 'idle', className = '' }) {
  const svgRef = useRef(null);
  const resolvedMood = MOUTH_PATHS[mood] ? mood : 'idle';

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;

    const resetLook = () => {
      el.style.setProperty('--pupil-x', '0px');
      el.style.setProperty('--pupil-y', '0px');
      el.style.setProperty('--face-x', '0px');
      el.style.setProperty('--face-y', '0px');
      el.style.setProperty('--face-tilt', '0deg');
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
      const norm = Math.min(dist / 260, 1);

      const pupilX = Math.cos(angle) * norm * 4;
      const pupilY = Math.sin(angle) * norm * 4;
      const faceX = Math.cos(angle) * norm * 3;
      const faceY = Math.sin(angle) * norm * 2.5;
      const faceTilt = (faceX / 3) * 2.5;

      el.style.setProperty('--pupil-x', `${pupilX.toFixed(2)}px`);
      el.style.setProperty('--pupil-y', `${pupilY.toFixed(2)}px`);
      el.style.setProperty('--face-x', `${faceX.toFixed(2)}px`);
      el.style.setProperty('--face-y', `${faceY.toFixed(2)}px`);
      el.style.setProperty('--face-tilt', `${faceTilt.toFixed(2)}deg`);
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
      viewBox="0 0 260 140"
      width="260"
      height="140"
      className={`rg-mascots mood-${resolvedMood} ${className}`.trim()}
      role="img"
      aria-label="ResearchGraph agent mascots"
    >
      {/* Subtle desk baseline */}
      <line
        x1="14"
        y1="130"
        x2="246"
        y2="130"
        className="rg-mascot-baseline"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {CREATURES.map((c, idx) => (
        <g
          key={c.id}
          className={`rg-mascot-creature rg-mascot-creature-${idx} ${c.className}`}
        >
          <path d={c.bodyPath} className="rg-mascot-body" />

          <g transform={`translate(${c.faceX}, ${c.faceY})`}>
            <g className="rg-mascot-face">
              {/* Left & Right Eyes */}
              {[-c.eyeDx, c.eyeDx].map((ex, eyeIdx) => (
                <g key={eyeIdx} transform={`translate(${ex}, ${c.eyeDy})`}>
                  {resolvedMood === 'sad' && (
                    <line
                      x1={eyeIdx === 0 ? -5 : -4}
                      y1={eyeIdx === 0 ? -8 : -10}
                      x2={eyeIdx === 0 ? 4 : 5}
                      y2={eyeIdx === 0 ? -10 : -8}
                      stroke={c.browStroke}
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      opacity="0.75"
                    />
                  )}
                  <g className="rg-mascot-eye-scale">
                    <circle cx="0" cy="0" r={c.eyeR} fill="#FFFFFF" />
                    <circle
                      cx="0"
                      cy="0"
                      r={c.pupilR}
                      fill="#18181B"
                      className="rg-mascot-pupil"
                    />
                  </g>
                </g>
              ))}

              {/* Expressive Mouth */}
              <path
                d={MOUTH_PATHS[resolvedMood]}
                transform={`translate(0, ${c.mouthY})`}
                fill="none"
                stroke={c.mouthStroke}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="rg-mascot-mouth"
              />
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}

export default AgentMascots;
