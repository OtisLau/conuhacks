/**
 * Custom hook for canvas rendering
 * Handles setup, animation loop, and DPR scaling
 */

import { useEffect, RefObject, DependencyList } from 'react';

export type RenderFunction = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void;

export function useCanvas(
  canvasRef: RefObject<HTMLCanvasElement>,
  render: RenderFunction,
  deps: DependencyList = []
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Set physical size for Retina displays
    canvas.width = window.screen.width * dpr;
    canvas.height = window.screen.height * dpr;

    // Set CSS size
    canvas.style.width = `${window.screen.width}px`;
    canvas.style.height = `${window.screen.height}px`;

    // Scale context so rendering code can use CSS pixel coordinates
    ctx.scale(dpr, dpr);

    console.log('Canvas initialized:', canvas.width, 'x', canvas.height, 'DPR:', dpr);

    let animationId: number;

    const animate = () => {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.screen.width, window.screen.height);
      render(ctx, canvas);
      ctx.restore();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [canvasRef, render, ...deps]);
}
