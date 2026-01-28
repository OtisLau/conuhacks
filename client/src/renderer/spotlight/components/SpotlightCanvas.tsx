/**
 * Spotlight Canvas component
 * Renders a red glow circle that follows the mouse cursor
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useCanvas } from '../../overlay/hooks/useCanvas';
import './SpotlightCanvas.css';

const SpotlightCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // Listen for global mouse move events
  useEffect(() => {
    const cleanup = window.electronAPI.onGlobalMouseMove((event) => {
      setMousePos({ x: event.position.x, y: event.position.y });
    });

    return cleanup;
  }, []);

  const render = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const circleRadius = 60;
    const haloRadius = 120;
    const { x: mouseX, y: mouseY } = mousePos;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
  }, [mousePos]);

  useCanvas(canvasRef, render);

  return <canvas ref={canvasRef} className="spotlight-canvas" />;
};

export default SpotlightCanvas;
