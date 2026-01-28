/**
 * Overlay Canvas component
 * Renders the border and spotlight effects
 */

import React, { useRef, useCallback } from 'react';
import { useCanvas } from '../../hooks/useCanvas';
import { useSpotlight } from '../../hooks/useSpotlight';
import './OverlayCanvas.css';

const OverlayCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spotlight = useSpotlight();

  const render = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    // Draw border
    ctx.strokeStyle = 'rgba(142, 142, 147, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.setLineDash([]);

    // Draw spotlight if visible
    if (spotlight.isVisible) {
      drawSpotlight(ctx, spotlight);
    }
  }, [spotlight]);

  useCanvas(canvasRef, render);

  return <canvas ref={canvasRef} className="overlay-canvas" />;
};

/**
 * Draw the spotlight circle with dimmed overlay
 */
function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  spotlight: { x: number; y: number; radius: number; opacity: number }
) {
  const { x, y, radius, opacity } = spotlight;

  // Make radius 15% bigger for display
  const displayRadius = radius * 1.15;
  const featherSize = displayRadius * 0.3;

  // Draw dimmed overlay
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${0.65 * opacity})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Cut out spotlight with soft gradient
  ctx.globalCompositeOperation = 'destination-out';

  const gradient = ctx.createRadialGradient(
    x, y, displayRadius - featherSize,
    x, y, displayRadius + featherSize
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.beginPath();
  ctx.arc(x, y, displayRadius + featherSize, 0, 2 * Math.PI);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.restore();

  // Add subtle inner glow
  ctx.save();
  const innerGlowGradient = ctx.createRadialGradient(x, y, 0, x, y, displayRadius);
  innerGlowGradient.addColorStop(0, `rgba(255, 255, 255, ${0.08 * opacity})`);
  innerGlowGradient.addColorStop(0.7, `rgba(255, 255, 255, ${0.03 * opacity})`);
  innerGlowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.beginPath();
  ctx.arc(x, y, displayRadius, 0, 2 * Math.PI);
  ctx.fillStyle = innerGlowGradient;
  ctx.fill();
  ctx.restore();

  // Draw soft organic halo
  const pulse = Math.sin(Date.now() / 400) * 0.1 + 0.9;

  // Soft outer glow
  ctx.save();
  const outerGlow = ctx.createRadialGradient(
    x, y, displayRadius * 0.95,
    x, y, displayRadius * 1.12
  );
  outerGlow.addColorStop(0, 'rgba(255, 255, 255, 0)');
  outerGlow.addColorStop(0.4, `rgba(255, 255, 255, ${0.12 * pulse * opacity})`);
  outerGlow.addColorStop(0.7, `rgba(255, 255, 255, ${0.06 * pulse * opacity})`);
  outerGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.beginPath();
  ctx.arc(x, y, displayRadius * 1.12, 0, 2 * Math.PI);
  ctx.fillStyle = outerGlow;
  ctx.fill();
  ctx.restore();

  // Soft diffuse ring
  ctx.save();
  const ringGlow = ctx.createRadialGradient(
    x, y, displayRadius * 0.92,
    x, y, displayRadius * 1.12
  );
  ringGlow.addColorStop(0, 'rgba(255, 255, 255, 0)');
  ringGlow.addColorStop(0.3, `rgba(255, 255, 255, ${0.08 * pulse * opacity})`);
  ringGlow.addColorStop(0.5, `rgba(255, 255, 255, ${0.15 * pulse * opacity})`);
  ringGlow.addColorStop(0.7, `rgba(255, 255, 255, ${0.08 * pulse * opacity})`);
  ringGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.beginPath();
  ctx.arc(x, y, displayRadius * 1.12, 0, 2 * Math.PI);
  ctx.fillStyle = ringGlow;
  ctx.fill();
  ctx.restore();
}

export default OverlayCanvas;
