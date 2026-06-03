import React from "react";
import { Menu } from "lucide-react";

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  pulse: number;
  radius: number;
  color: string;
};

const PALETTE = ["203, 213, 225", "103, 232, 249", "251, 182, 206", "253, 224, 71", "190, 242, 100"];

export function VibeLanding({ onOpenMenu, menuLabel }: { onOpenMenu: () => void; menuLabel: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particles: Particle[] = [];
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let time = 0;
    const edgeAlphaByKey = new Map<string, number>();
    const glowAlphaByKey = new Map<string, number>();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = Math.min(340, Math.max(150, Math.floor((width * height) / 3400)));
      while (particles.length < targetCount) {
        const z = 0.35 + Math.random() * 1.35;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z,
          vx: (Math.random() - 0.5) * (0.22 + z * 0.18),
          vy: (Math.random() - 0.5) * (0.18 + z * 0.14),
          pulse: Math.random() * Math.PI * 2,
          radius: 0.7 + Math.random() * 1.8,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
        });
      }
      particles.length = targetCount;
    };

    const draw = () => {
      time += reducedMotion ? 0.002 : 0.012;
      context.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const zoom = 1 + Math.sin(time * 0.8) * 0.035;
      context.save();
      context.translate(cx, cy);
      context.scale(zoom, zoom);
      context.translate(-cx, -cy);

      const gradient = context.createRadialGradient(cx, cy * 0.9, 0, cx, cy, Math.max(width, height) * 0.75);
      gradient.addColorStop(0, "rgba(24, 24, 27, 0.88)");
      gradient.addColorStop(0.48, "rgba(3, 7, 18, 0.96)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
      context.fillStyle = gradient;
      context.fillRect(-40, -40, width + 80, height + 80);

      for (const particle of particles) {
        particle.x += particle.vx * (reducedMotion ? 0.25 : 1);
        particle.y += particle.vy * (reducedMotion ? 0.25 : 1);
        particle.x += Math.sin(time + particle.pulse) * 0.08 * particle.z;
        particle.y += Math.cos(time * 0.7 + particle.pulse) * 0.07 * particle.z;

        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;
      }

      context.lineCap = "round";
      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const limit = 118 + (a.z + b.z) * 28;
          const edgeKey = `${i}:${j}`;
          const currentOpacity = edgeAlphaByKey.get(edgeKey) ?? 0;
          const targetOpacity = distance <= limit ? 0.38 + (1 - distance / limit) * 0.28 : 0;
          const opacity = currentOpacity + (targetOpacity - currentOpacity) * (targetOpacity > currentOpacity ? 0.12 : 0.075);
          if (opacity < 0.018) {
            edgeAlphaByKey.delete(edgeKey);
            continue;
          }
          edgeAlphaByKey.set(edgeKey, opacity);

          context.strokeStyle = `rgba(${a.color}, ${opacity})`;
          context.lineWidth = 0.7 + Math.min(a.z, b.z) * 0.6;
          context.setLineDash(distance < limit * 0.55 ? [] : [2, 7]);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();

          if (j % 7 === 0 && opacity > 0.19) {
            const c = particles[(j + i + 19) % particles.length];
            const cd = Math.hypot(a.x - c.x, a.y - c.y);
            const bd = Math.hypot(b.x - c.x, b.y - c.y);
            if (cd < limit * 1.05 && bd < limit * 1.05) {
              context.fillStyle = `rgba(${b.color}, ${opacity * 0.24})`;
              context.beginPath();
              context.moveTo(a.x, a.y);
              context.lineTo(b.x, b.y);
              context.lineTo(c.x, c.y);
              context.closePath();
              context.fill();
            }
          }
        }
      }
      context.setLineDash([]);

      context.globalCompositeOperation = "screen";
      context.filter = "blur(1.6px)";
      for (let i = 0; i < particles.length; i += 3) {
        const a = particles[i];
        for (let j = i + 1; j < Math.min(particles.length, i + 36); j += 5) {
          const b = particles[(j * 13) % particles.length];
          const glowKey = `${i}:${j}`;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const currentGlow = glowAlphaByKey.get(glowKey) ?? 0;
          const targetGlow = distance <= 190 ? 0.2 + (1 - distance / 190) * 0.2 : 0;
          const glowOpacity = currentGlow + (targetGlow - currentGlow) * (targetGlow > currentGlow ? 0.1 : 0.065);
          if (glowOpacity < 0.012) {
            glowAlphaByKey.delete(glowKey);
            continue;
          }
          glowAlphaByKey.set(glowKey, glowOpacity);
          context.strokeStyle = `rgba(${b.color}, ${glowOpacity})`;
          context.lineWidth = 2.2;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
      context.filter = "none";

      context.filter = "blur(9px)";
      for (const particle of particles) {
        if (particle.z < 1.25) continue;
        context.fillStyle = `rgba(${particle.color}, 0.19)`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * 8 * particle.z, 0, Math.PI * 2);
        context.fill();
      }
      context.filter = "none";

      for (const particle of particles) {
        const alpha = 0.52 + Math.sin(time * 2 + particle.pulse) * 0.16 + particle.z * 0.18;
        context.fillStyle = `rgba(${particle.color}, ${Math.min(0.9, alpha)})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * particle.z, 0, Math.PI * 2);
        context.fill();
      }
      context.globalCompositeOperation = "source-over";
      context.restore();

      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-black">
      <button type="button" className="fixed left-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/80 p-0 text-sm font-medium text-zinc-300 shadow-lg shadow-black/30 backdrop-blur transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 md:hidden" aria-label={menuLabel} onClick={onOpenMenu}>
        <Menu aria-hidden="true" className="h-4 w-4" />
      </button>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.18)_42%,rgba(0,0,0,0.82)_100%)]" />
      <main className="relative z-10 grid min-h-0 flex-1 place-items-center px-6">
        <h1 className="select-none text-center text-[clamp(3.2rem,12vw,9.5rem)] font-semibold leading-none tracking-normal text-zinc-50 drop-shadow-[0_0_28px_rgba(34,211,238,0.38)]">
          <span className="block">NDX</span>
          <span className="block bg-gradient-to-r from-cyan-200 via-zinc-50 to-rose-200 bg-clip-text text-transparent">vibe</span>
        </h1>
      </main>
    </div>
  );
}
