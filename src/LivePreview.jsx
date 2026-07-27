import { useEffect, useRef } from 'react';
import './live-preview.css';

const palette = ['#e45e36', '#66803e', '#e7a72e', '#4b82a8', '#9c5f91', '#288c87'];
const initials = (name) => name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
const hue = (id) => [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);

export default function LivePreview({ attendees, leaderboard = [], onClose }) {
  const canvasRef = useRef(null); const ballsRef = useRef(new Map()); const attendeesRef = useRef(attendees); const leaderboardRef = useRef(leaderboard);
  useEffect(() => { attendeesRef.current = attendees; leaderboardRef.current = leaderboard; }, [attendees, leaderboard]);
  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas.getContext('2d'); let frame; let last = performance.now();
    const resize = () => { const rect = canvas.getBoundingClientRect(); const ratio = devicePixelRatio || 1; canvas.width = rect.width * ratio; canvas.height = rect.height * ratio; context.setTransform(ratio, 0, 0, ratio, 0, 0); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas);
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, .035); last = now; const width = canvas.clientWidth; const height = canvas.clientHeight; const baseRadius = Math.max(22, Math.min(34, width / 11)); const currentAttendees = attendeesRef.current; const progress = new Map(leaderboardRef.current.map(row => [row.attendee_id, row.total_cells ? Number(row.completed_count) / Number(row.total_cells) : 0]));
      currentAttendees.forEach((person, index) => { if (!ballsRef.current.has(person.id)) ballsRef.current.set(person.id, { id: person.id, name: person.name, x: width * (.2 + ((hue(person.id) % 60) / 100)), y: -baseRadius * (index + 2), vx: ((hue(person.id) % 100) - 50) * .35, vy: 0, color: palette[hue(person.id) % palette.length], r: baseRadius }); });
      const balls = currentAttendees.map(person => ballsRef.current.get(person.id)).filter(Boolean);
      balls.forEach(ball => { ball.r += ((baseRadius * (1 + (progress.get(ball.id) || 0) * .75)) - ball.r) * .08; ball.vy += 620 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; if (ball.x - ball.r < 10) { ball.x = 10 + ball.r; ball.vx *= -.72; } if (ball.x + ball.r > width - 10) { ball.x = width - 10 - ball.r; ball.vx *= -.72; } if (ball.y + ball.r > height - 18) { ball.y = height - 18 - ball.r; ball.vy *= -.58; ball.vx *= .985; } });
      for (let i = 0; i < balls.length; i += 1) for (let j = i + 1; j < balls.length; j += 1) { const a = balls[i], b = balls[j]; const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1; if (distance < a.r + b.r) { const nx = dx / distance, ny = dy / distance, overlap = a.r + b.r - distance; a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; b.x += nx * overlap / 2; b.y += ny * overlap / 2; const impulse = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (impulse < 0) { a.vx += impulse * nx; a.vy += impulse * ny; b.vx -= impulse * nx; b.vy -= impulse * ny; } } }
      context.clearRect(0, 0, width, height); context.strokeStyle = '#8cb5c5'; context.lineWidth = 6; context.strokeRect(6, 6, width - 12, height - 12); context.fillStyle = '#bce7f3'; context.fillRect(9, height - 32, width - 18, 20);
      balls.forEach(ball => { const shine = context.createRadialGradient(ball.x - ball.r * .35, ball.y - ball.r * .38, ball.r * .08, ball.x, ball.y, ball.r); shine.addColorStop(0, 'rgba(255,255,255,.94)'); shine.addColorStop(.2, ball.color); shine.addColorStop(.78, ball.color); shine.addColorStop(1, 'rgba(0,0,0,.3)'); context.beginPath(); context.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); context.fillStyle = shine; context.fill(); context.fillStyle = '#fff'; context.font = `600 ${Math.max(12, ball.r * .47)}px system-ui`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(initials(ball.name), ball.x, ball.y); }); frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <main className="live-preview"><header><div><span className="eyebrow">LIVE PREVIEW</span><h1>The aquarium is filling up</h1><p>{attendees.length} players in the jar</p></div><button className="quiet" onClick={onClose}>Back to dashboard</button></header><canvas ref={canvasRef} aria-label="Animated aquarium with a ball for each attendee" /></main>;
}
