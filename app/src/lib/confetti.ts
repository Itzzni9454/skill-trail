/**
 * Tiny dependency-free canvas confetti burst.
 *
 * Used when streak-milestone toasts fire. Draws on a temporary full-viewport
 * canvas (pointer-events: none) and removes it once all particles are gone.
 * Respects `prefers-reduced-motion`.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rot: number;
  vr: number;
  circle: boolean;
  born: number;
  life: number;
}

const COLORS = ['#f97316', '#f59e0b', '#10b981', '#38bdf8', '#a78bfa', '#f43f5e'];
const GRAVITY = 0.22;
const DRAG = 0.99;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf: number | null = null;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:70;';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cleanup() {
  if (raf != null) cancelAnimationFrame(raf);
  raf = null;
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  ctx = null;
}

function tick(now: number) {
  const c = ctx;
  if (!c) return;
  c.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => {
    const age = now - p.born;
    if (age >= p.life || p.y > window.innerHeight + 24) return false;

    p.vy += GRAVITY;
    p.vx *= DRAG;
    p.vy *= DRAG;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;

    c.globalAlpha = Math.max(0, 1 - age / p.life);
    c.fillStyle = p.color;
    c.beginPath();
    if (p.circle) {
      c.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
    } else {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    c.fill();
    return true;
  });
  c.globalAlpha = 1;

  if (particles.length === 0) cleanup();
  else raf = requestAnimationFrame(tick);
}

/**
 * Fire a confetti burst. Defaults to the bottom-right corner where the toast
 * stack appears, so the celebration visually comes from the toast.
 */
export function fireConfetti(opts?: { x?: number; y?: number; count?: number }) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  ensureCanvas();
  const count = opts?.count ?? 140;
  const x = opts?.x ?? window.innerWidth - 180;
  const y = opts?.y ?? window.innerHeight - 140;
  const now = performance.now();

  for (let i = 0; i < count; i++) {
    // upward-biased spray
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.9);
    const speed = 6 + Math.random() * 9;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      circle: Math.random() < 0.3,
      born: now,
      life: 1700 + Math.random() * 900,
    });
  }

  if (raf == null) raf = requestAnimationFrame(tick);
}
