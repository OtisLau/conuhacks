/**
 * Spotlight Canvas component
 * Renders a highlight for target elements or follows mouse cursor
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useCanvas } from '../../overlay/hooks/useCanvas';
import './SpotlightCanvas.css';

interface TargetPosition {
  x: number;
  y: number;
  bbox?: [number, number, number, number] | null;
}

const SpotlightCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [targetPos, setTargetPos] = useState<TargetPosition | null>(null);

  // Listen for global mouse move events
  useEffect(() => {
    const cleanup = window.electronAPI.onGlobalMouseMove((event) => {
      setMousePos({ x: event.position.x, y: event.position.y });
    });

    return cleanup;
  }, []);

  // Listen for spotlight position updates from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onSetSpotlightPosition((coords: TargetPosition | null) => {
      console.log('Spotlight position received:', coords);
      setTargetPos(coords);
    });

    return cleanup;
  }, []);

  // Check if mouse is near target (for click detection)
  const isMouseNearTarget = useCallback(() => {
    if (!targetPos) return false;
    const distance = Math.sqrt(
      Math.pow(mousePos.x - targetPos.x, 2) + Math.pow(mousePos.y - targetPos.y, 2)
    );
    // Consider "near" if within 80px or inside bbox
    if (distance < 80) return true;
    if (targetPos.bbox) {
      const [x1, y1, x2, y2] = targetPos.bbox;
      const padding = 20;
      return mousePos.x >= x1 - padding && mousePos.x <= x2 + padding &&
             mousePos.y >= y1 - padding && mousePos.y <= y2 + padding;
    }
    return false;
  }, [mousePos, targetPos]);

  const render = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If we have a target position, draw target highlight
    if (targetPos) {
      const { x: targetX, y: targetY, bbox } = targetPos;
      const nearTarget = isMouseNearTarget();

      if (bbox) {
        // Draw bounding box highlight
        const [x1, y1, x2, y2] = bbox;
        const width = x2 - x1;
        const height = y2 - y1;
        const padding = 8;
        const cornerRadius = 8;

        // Outer glow
        ctx.shadowColor = nearTarget ? 'rgba(74, 222, 128, 0.8)' : 'rgba(255, 60, 60, 0.6)';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = nearTarget ? 'rgba(74, 222, 128, 0.9)' : 'rgba(255, 80, 80, 0.8)';
        ctx.lineWidth = 3;

        // Draw rounded rectangle
        ctx.beginPath();
        ctx.roundRect(
          x1 - padding,
          y1 - padding,
          width + padding * 2,
          height + padding * 2,
          cornerRadius
        );
        ctx.stroke();

        // Inner fill (subtle)
        ctx.fillStyle = nearTarget ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 80, 80, 0.08)';
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Pulsing animation effect - draw second border
        const pulseAlpha = 0.3 + Math.sin(Date.now() / 300) * 0.2;
        ctx.strokeStyle = nearTarget
          ? `rgba(74, 222, 128, ${pulseAlpha})`
          : `rgba(255, 80, 80, ${pulseAlpha})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(
          x1 - padding - 4,
          y1 - padding - 4,
          width + padding * 2 + 8,
          height + padding * 2 + 8,
          cornerRadius + 2
        );
        ctx.stroke();
      } else {
        // Draw circle highlight at center point
        const circleRadius = 40;
        const haloRadius = 80;

        // Outer soft glow
        const outerGlow = ctx.createRadialGradient(
          targetX, targetY, haloRadius * 0.5,
          targetX, targetY, haloRadius * 1.5
        );
        const baseColor = nearTarget ? [74, 222, 128] : [255, 60, 60];
        outerGlow.addColorStop(0, `rgba(${baseColor.join(',')}, 0.4)`);
        outerGlow.addColorStop(0.5, `rgba(${baseColor.join(',')}, 0.2)`);
        outerGlow.addColorStop(1, `rgba(${baseColor.join(',')}, 0)`);

        ctx.beginPath();
        ctx.arc(targetX, targetY, haloRadius * 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = outerGlow;
        ctx.fill();

        // Main ring
        ctx.strokeStyle = nearTarget ? 'rgba(74, 222, 128, 0.9)' : 'rgba(255, 80, 80, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(targetX, targetY, circleRadius, 0, 2 * Math.PI);
        ctx.stroke();

        // Pulsing outer ring
        const pulseRadius = circleRadius + 10 + Math.sin(Date.now() / 300) * 5;
        const pulseAlpha = 0.3 + Math.sin(Date.now() / 300) * 0.2;
        ctx.strokeStyle = nearTarget
          ? `rgba(74, 222, 128, ${pulseAlpha})`
          : `rgba(255, 80, 80, ${pulseAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(targetX, targetY, pulseRadius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    } else {
      // No target - follow mouse with subtle indicator
      const circleRadius = 60;
      const haloRadius = 120;
      const { x: mouseX, y: mouseY } = mousePos;

      // Outer soft glow - very diffuse
      const outerGlow = ctx.createRadialGradient(
        mouseX, mouseY, haloRadius * 0.6,
        mouseX, mouseY, haloRadius * 1.5
      );
      outerGlow.addColorStop(0, 'rgba(255, 60, 60, 0.3)');
      outerGlow.addColorStop(0.4, 'rgba(255, 40, 40, 0.15)');
      outerGlow.addColorStop(0.7, 'rgba(255, 30, 30, 0.05)');
      outerGlow.addColorStop(1, 'rgba(255, 20, 20, 0)');

      ctx.beginPath();
      ctx.arc(mouseX, mouseY, haloRadius * 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = outerGlow;
      ctx.fill();

      // Main ring - thicker and diffuse
      const ringGradient = ctx.createRadialGradient(
        mouseX, mouseY, circleRadius * 0.5,
        mouseX, mouseY, haloRadius
      );
      ringGradient.addColorStop(0, 'rgba(255, 80, 80, 0)');
      ringGradient.addColorStop(0.4, 'rgba(255, 70, 70, 0.4)');
      ringGradient.addColorStop(0.6, 'rgba(255, 60, 60, 0.6)');
      ringGradient.addColorStop(0.75, 'rgba(255, 50, 50, 0.4)');
      ringGradient.addColorStop(0.9, 'rgba(255, 40, 40, 0.15)');
      ringGradient.addColorStop(1, 'rgba(255, 30, 30, 0)');

      ctx.beginPath();
      ctx.arc(mouseX, mouseY, haloRadius, 0, 2 * Math.PI);
      ctx.fillStyle = ringGradient;
      ctx.fill();

      // Subtle inner glow
      const coreGradient = ctx.createRadialGradient(
        mouseX, mouseY, 0,
        mouseX, mouseY, circleRadius * 0.8
      );
      coreGradient.addColorStop(0, 'rgba(255, 120, 120, 0.3)');
      coreGradient.addColorStop(0.5, 'rgba(255, 90, 90, 0.15)');
      coreGradient.addColorStop(1, 'rgba(255, 70, 70, 0)');

      ctx.beginPath();
      ctx.arc(mouseX, mouseY, circleRadius * 0.8, 0, 2 * Math.PI);
      ctx.fillStyle = coreGradient;
      ctx.fill();
    }
  }, [mousePos, targetPos, isMouseNearTarget]);

  useCanvas(canvasRef, render);

  return <canvas ref={canvasRef} className="spotlight-canvas" />;
};

export default SpotlightCanvas;
