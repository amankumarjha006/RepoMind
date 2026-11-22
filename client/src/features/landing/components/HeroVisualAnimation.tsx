import * as React from 'react';
import { animate, stagger } from 'animejs';
import { useReducedMotion } from 'motion/react';
import { useTheme } from '../../../lib/ThemeContext';

export const HeroVisualAnimation: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const shouldReduceMotion = useReducedMotion();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });

  // Theme-reactive color tokens
  const palette = React.useMemo(() => {
    return isDark
      ? {
          primary: '#8AB4F8',
          secondary: '#81C995',
          coreGlow1: '#8AB4F8',
          coreCenter: '#FFFFFF',
          coreCenterBorder: '#8AB4F8',
          nodeDark: '#E8EAED',
          hairlineStrong: 'rgba(255, 255, 255, 0.18)',
          hairlineSubtle: 'rgba(255, 255, 255, 0.08)',
          bloom1: 'rgba(138, 180, 248, 0.22)',
          bloom2: 'rgba(129, 201, 149, 0.12)',
          ringStroke: 1.5,
          waveStroke: 1.25,
          beamStroke: 1.25,
          ringOpacity: 0.85,
          cardinalOpacity: 0.6,
          blurRadius: 2.5,
        }
      : {
          primary: '#1A73E8', // Rich, vibrant Google Blue with 5:1+ contrast on light paper
          secondary: '#137333', // Deep forest/emerald green
          coreGlow1: '#1A73E8',
          coreCenter: '#0B1B3D', // Deep midnight navy center so it pops on paper
          coreCenterBorder: '#1A73E8',
          nodeDark: '#14161A',
          hairlineStrong: 'rgba(20, 22, 26, 0.28)',
          hairlineSubtle: 'rgba(20, 22, 26, 0.14)',
          bloom1: 'rgba(26, 115, 232, 0.18)',
          bloom2: 'rgba(19, 115, 51, 0.10)',
          ringStroke: 2,
          waveStroke: 1.75,
          beamStroke: 1.75,
          ringOpacity: 0.95,
          cardinalOpacity: 0.85,
          blurRadius: 1.5,
        };
  }, [isDark]);

  // Mouse move parallax tilt
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: x * 16, y: -y * 16 });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  React.useEffect(() => {
    if (shouldReduceMotion || !svgRef.current) return;

    let isCancelled = false;

    // 1. Animate pulsating core nucleus
    const coreAnimation = animate('#hero-core-glow', {
      scale: [0.92, 1.14],
      opacity: [0.75, 1],
      duration: 2600,
      ease: 'inOutSine',
      direction: 'alternate',
      loop: true,
    });

    // 2. Animate sonar radar wave pulses expanding from center
    const waves = svgRef.current.querySelectorAll('.sonar-wave');
    if (waves.length) {
      animate(waves, {
        r: [30, 215],
        opacity: [isDark ? 0.55 : 0.7, 0],
        duration: 3600,
        delay: stagger(1200),
        ease: 'outQuad',
        loop: true,
      });
    }

    // 3. Animate Gyroscopic Orbital Rings rotation
    const ring1 = svgRef.current.querySelector('#orbit-ring-1');
    const ring2 = svgRef.current.querySelector('#orbit-ring-2');
    const ring3 = svgRef.current.querySelector('#orbit-ring-3');

    if (ring1) {
      animate(ring1, {
        rotate: [0, 360],
        duration: 24000,
        ease: 'linear',
        loop: true,
      });
    }
    if (ring2) {
      animate(ring2, {
        rotate: [0, -360],
        duration: 32000,
        ease: 'linear',
        loop: true,
      });
    }
    if (ring3) {
      animate(ring3, {
        rotate: [0, 360],
        duration: 40000,
        ease: 'linear',
        loop: true,
      });
    }

    // 4. Animate floating synaptic nodes pulsing along orbits
    const nodes = svgRef.current.querySelectorAll('.orbit-node');
    if (nodes.length) {
      animate(nodes, {
        scale: [0.8, 1.35],
        opacity: [0.4, 1],
        duration: 1800,
        delay: stagger(280, { from: 'center' }),
        ease: 'inOutSine',
        direction: 'alternate',
        loop: true,
      });
    }

    // 5. Dynamic synaptic connection beams (drawing and fading)
    const beams = svgRef.current.querySelectorAll('.synapse-beam');
    if (beams.length) {
      beams.forEach((beam) => {
        try {
          const pathEl = beam as SVGPathElement;
          const len = pathEl.getTotalLength();
          pathEl.style.strokeDasharray = `${len}`;
          pathEl.style.strokeDashoffset = `${len}`;
        } catch {
          // ignore if not ready
        }
      });

      animate(beams, {
        strokeDashoffset: (el: any) => {
          try {
            return [el.getTotalLength(), 0];
          } catch {
            return [100, 0];
          }
        },
        opacity: [0, isDark ? 0.85 : 0.95, 0],
        duration: 2800,
        delay: stagger(700),
        ease: 'inOutQuad',
        loop: true,
      });
    }

    return () => {
      isCancelled = true;
      try {
        coreAnimation?.pause();
      } catch {
        // cleanup safe
      }
    };
  }, [shouldReduceMotion, isDark]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-[440px] sm:max-w-[480px] xl:max-w-[520px] aspect-square flex items-center justify-center select-none"
      style={{
        perspective: '1000px',
      }}
    >
      {/* Ambient background bloom */}
      <div
        className="absolute inset-4 rounded-full pointer-events-none opacity-60 blur-3xl transition-all duration-500"
        style={{
          background: `radial-gradient(circle, ${palette.bloom1} 0%, ${palette.bloom2} 45%, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* 3D Tilting Gyroscope Canvas */}
      <div
        className="relative w-full h-full flex items-center justify-center transition-transform duration-200 ease-out"
        style={{
          transform: shouldReduceMotion
            ? 'none'
            : `rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 500 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full overflow-visible"
          aria-label="Codebase Intelligence neural core visualization"
          role="img"
        >
          <defs>
            {/* Core Gradient */}
            <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={palette.primary} stopOpacity={isDark ? '1' : '0.85'} />
              <stop offset="60%" stopColor={palette.primary} stopOpacity={isDark ? '0.4' : '0.25'} />
              <stop offset="100%" stopColor={palette.primary} stopOpacity="0" />
            </radialGradient>

            {/* Mint/Forest Secondary Gradient */}
            <radialGradient id="mintGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={palette.secondary} stopOpacity={isDark ? '0.9' : '0.85'} />
              <stop offset="100%" stopColor={palette.secondary} stopOpacity="0" />
            </radialGradient>

            {/* Glowing Ring Linear Gradients */}
            <linearGradient id="ringGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={palette.primary} stopOpacity={palette.ringOpacity} />
              <stop offset="50%" stopColor={palette.primary} stopOpacity={isDark ? '0.15' : '0.35'} />
              <stop offset="100%" stopColor={palette.secondary} stopOpacity={palette.ringOpacity} />
            </linearGradient>

            <linearGradient id="ringGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={palette.secondary} stopOpacity={palette.ringOpacity} />
              <stop offset="50%" stopColor={palette.primary} stopOpacity={isDark ? '0.15' : '0.35'} />
              <stop offset="100%" stopColor={palette.primary} stopOpacity={palette.ringOpacity} />
            </linearGradient>

            <filter id="coreGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={isDark ? '6' : '3.5'} result="blur1" />
              <feGaussianBlur stdDeviation={isDark ? '14' : '8'} result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={palette.blurRadius} result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* ── 1. Sonar Radar Pulse Waves (Expanding Rings) ─────── */}
          <circle
            cx="250"
            cy="250"
            r="30"
            className="sonar-wave"
            stroke="url(#ringGrad1)"
            strokeWidth={palette.waveStroke}
            fill="none"
            opacity="0"
          />
          <circle
            cx="250"
            cy="250"
            r="30"
            className="sonar-wave"
            stroke="url(#ringGrad2)"
            strokeWidth={palette.waveStroke}
            fill="none"
            opacity="0"
          />
          <circle
            cx="250"
            cy="250"
            r="30"
            className="sonar-wave"
            stroke={palette.primary}
            strokeWidth={isDark ? '0.75' : '1.25'}
            strokeDasharray="4 6"
            fill="none"
            opacity="0"
          />

          {/* ── 2. Outer Astrolabe Coordinate Ring ──────────────── */}
          <circle
            cx="250"
            cy="250"
            r="215"
            stroke={palette.hairlineStrong}
            strokeWidth="1.25"
            strokeDasharray="2 8"
            fill="none"
            opacity={isDark ? 0.65 : 0.85}
          />
          <circle
            cx="250"
            cy="250"
            r="200"
            stroke={palette.hairlineSubtle}
            strokeWidth="1"
            fill="none"
          />

          {/* Cardinal Coordinate Ticks */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="250"
              y1="40"
              x2="250"
              y2="46"
              stroke={palette.primary}
              strokeWidth="1.75"
              strokeOpacity={palette.cardinalOpacity}
              transform={`rotate(${deg} 250 250)`}
            />
          ))}

          {/* ── 3. Rotating Gyroscopic Orbital Rings ────────────── */}
          {/* Ring 1 (Tilted -25deg) */}
          <g id="orbit-ring-1" transform-origin="250 250">
            <ellipse
              cx="250"
              cy="250"
              rx="185"
              ry="75"
              transform="rotate(-25 250 250)"
              stroke="url(#ringGrad1)"
              strokeWidth={palette.ringStroke}
              strokeDasharray="6 8 35 12"
              fill="none"
              filter="url(#softGlow)"
            />
            {/* Orbiting Nodes on Ring 1 */}
            <circle cx="85" cy="180" r="4.5" fill={palette.primary} className="orbit-node" filter="url(#softGlow)" />
            <circle cx="415" cy="320" r="4" fill={palette.secondary} className="orbit-node" filter="url(#softGlow)" />
          </g>

          {/* Ring 2 (Tilted 40deg) */}
          <g id="orbit-ring-2" transform-origin="250 250">
            <ellipse
              cx="250"
              cy="250"
              rx="175"
              ry="80"
              transform="rotate(40 250 250)"
              stroke="url(#ringGrad2)"
              strokeWidth={palette.ringStroke}
              strokeDasharray="8 6 50 14"
              fill="none"
              filter="url(#softGlow)"
            />
            {/* Orbiting Nodes on Ring 2 */}
            <circle cx="370" cy="150" r="4" fill={palette.primary} className="orbit-node" filter="url(#softGlow)" />
            <circle cx="130" cy="350" r="4.5" fill={palette.secondary} className="orbit-node" filter="url(#softGlow)" />
          </g>

          {/* Ring 3 (Tilted 100deg) */}
          <g id="orbit-ring-3" transform-origin="250 250">
            <ellipse
              cx="250"
              cy="250"
              rx="165"
              ry="90"
              transform="rotate(100 250 250)"
              stroke={palette.primary}
              strokeOpacity={isDark ? '0.45' : '0.75'}
              strokeWidth={palette.ringStroke}
              strokeDasharray="4 6"
              fill="none"
            />
            {/* Orbiting Nodes on Ring 3 */}
            <circle cx="250" cy="85" r="3.5" fill={palette.nodeDark} className="orbit-node" />
            <circle cx="250" cy="415" r="3.5" fill={palette.primary} className="orbit-node" />
          </g>

          {/* ── 4. Synaptic Beams Connecting Nodes to Center ────── */}
          <path
            d="M 250 250 Q 160 210 85 180"
            stroke={palette.primary}
            strokeWidth={palette.beamStroke}
            fill="none"
            className="synapse-beam"
            opacity="0"
          />
          <path
            d="M 250 250 Q 320 190 370 150"
            stroke={palette.secondary}
            strokeWidth={palette.beamStroke}
            fill="none"
            className="synapse-beam"
            opacity="0"
          />
          <path
            d="M 250 250 Q 340 290 415 320"
            stroke={palette.primary}
            strokeWidth={palette.beamStroke}
            fill="none"
            className="synapse-beam"
            opacity="0"
          />
          <path
            d="M 250 250 Q 180 310 130 350"
            stroke={palette.secondary}
            strokeWidth={palette.beamStroke}
            fill="none"
            className="synapse-beam"
            opacity="0"
          />

          {/* ── 5. Geometric Inner Focal Rings ──────────────────── */}
          <circle
            cx="250"
            cy="250"
            r="70"
            stroke={palette.hairlineStrong}
            strokeWidth="1.25"
            strokeDasharray="3 5"
            fill="none"
          />
          <circle
            cx="250"
            cy="250"
            r="42"
            stroke={palette.primary}
            strokeOpacity={isDark ? '0.35' : '0.65'}
            strokeWidth={palette.ringStroke}
            fill="none"
          />

          {/* ── 6. Central Glowing Nucleus (The Repo Mind) ───────── */}
          {/* Broad Core Glow */}
          <circle
            id="hero-core-glow"
            cx="250"
            cy="250"
            r="38"
            fill="url(#coreGrad)"
            filter="url(#coreGlow)"
            transform-origin="250 250"
          />

          {/* Secondary Mint/Forest Internal Pulse */}
          <circle
            cx="250"
            cy="250"
            r="16"
            fill="url(#mintGrad)"
            opacity={isDark ? '0.8' : '0.85'}
          />

          {/* Core Star Focus (White in dark mode, crisp Navy + Blue border in light mode) */}
          <circle
            cx="250"
            cy="250"
            r={isDark ? '6' : '7'}
            fill={palette.coreCenter}
            stroke={palette.coreCenterBorder}
            strokeWidth={isDark ? '0' : '2'}
            filter="url(#softGlow)"
          />
        </svg>

        {/* Ambient floating status caption */}
        <div
          className={`absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2 px-3 py-1 rounded-full border transition-colors duration-300 ${
            isDark
              ? 'border-[var(--color-landing-hairline)] bg-[var(--color-landing-surface)]/80 text-[var(--color-landing-ink-tertiary)] shadow-xs'
              : 'border-[var(--color-landing-hairline-strong)] bg-[var(--color-landing-surface)] text-[var(--color-landing-ink)] shadow-md'
          } backdrop-blur-md text-[11px] font-[family-name:var(--font-code)] pointer-events-none`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-ready)] animate-pulse" />
          <span>AST Neural Mesh Active</span>
        </div>
      </div>
    </div>
  );
};
