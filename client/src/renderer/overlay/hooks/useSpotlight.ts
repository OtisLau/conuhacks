/**
 * Custom hook for spotlight animation state
 * Manages position, radius, and animation timing
 * Now uses tutorial store for state management
 */

import { useState, useEffect } from 'react';
import { useTutorialStore } from '../store/tutorialStore';

interface SpotlightState {
  isVisible: boolean;
  x: number;
  y: number;
  radius: number;
  opacity: number;
  animating: boolean;
}

interface AnimationConfig {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  startRadius: number;
  targetRadius: number;
  startTime: number;
  duration: number;
}

const DEFAULT_RADIUS = 40;
const ANIMATION_DURATION = 500; // ms
const FADE_DURATION = 300; // ms
const START_RADIUS = 30; // Start small from control panel

export function useSpotlight() {
  const [spotlight, setSpotlight] = useState<SpotlightState>({
    isVisible: false,
    x: 0,
    y: 0,
    radius: DEFAULT_RADIUS,
    opacity: 1,
    animating: false,
  });

  const [animation, setAnimation] = useState<AnimationConfig | null>(null);
  const [fadingOut, setFadingOut] = useState(false);
  const [fadeStartTime, setFadeStartTime] = useState(0);

  // Get spotlight coordinates from tutorial store
  const targetCoords = useTutorialStore((state) => state.targetCoords);

  // React to spotlight position changes from the store
  useEffect(() => {
    console.log('=== SPOTLIGHT COORDS FROM STORE ===', targetCoords);

    if (targetCoords) {
      const dpr = window.devicePixelRatio || 1;

      // Calculate radius from bounding box if available
      let targetRadius = DEFAULT_RADIUS * dpr;
      if (targetCoords.bbox && Array.isArray(targetCoords.bbox) && targetCoords.bbox.length === 4) {
        const [x1, y1, x2, y2] = targetCoords.bbox;
        const bboxWidth = Math.abs(x2 - x1);
        const bboxHeight = Math.abs(y2 - y1);
        const calcRadius = Math.max(bboxWidth, bboxHeight) / 2 + 20;
        targetRadius = Math.max(calcRadius, 50);
        console.log('Bbox:', targetCoords.bbox, 'Size:', bboxWidth, 'x', bboxHeight, 'Target Radius:', targetRadius);
      }

      // Calculate control panel center (start position for fly-out animation)
      const controlPanelCenterX = (window.innerWidth - 20 - 210) * dpr;
      const controlPanelCenterY = (20 + 30) * dpr;

      // Start fly-out animation
      setAnimation({
        startX: controlPanelCenterX,
        startY: controlPanelCenterY,
        targetX: targetCoords.x,
        targetY: targetCoords.y,
        startRadius: START_RADIUS,
        targetRadius,
        startTime: Date.now(),
        duration: ANIMATION_DURATION,
      });

      setSpotlight({
        isVisible: true,
        x: controlPanelCenterX,
        y: controlPanelCenterY,
        radius: START_RADIUS,
        opacity: 1,
        animating: true,
      });

      setFadingOut(false);
    } else {
      // Start fade-out animation
      if (spotlight.isVisible && !fadingOut) {
        setFadingOut(true);
        setFadeStartTime(Date.now());
        setAnimation(null);
      }
    }
  }, [targetCoords, spotlight.isVisible, fadingOut]);

  // Animation loop
  useEffect(() => {
    if (!animation && !fadingOut) return;

    let rafId: number;

    const tick = () => {
      const now = Date.now();

      // Handle fade-out animation
      if (fadingOut) {
        const elapsed = now - fadeStartTime;
        const progress = Math.min(elapsed / FADE_DURATION, 1);
        const opacity = 1 - progress;

        setSpotlight(prev => ({ ...prev, opacity }));

        if (progress >= 1) {
          setSpotlight({
            isVisible: false,
            x: 0,
            y: 0,
            radius: DEFAULT_RADIUS,
            opacity: 1,
            animating: false,
          });
          setFadingOut(false);
          return;
        }

        rafId = requestAnimationFrame(tick);
        return;
      }

      // Handle fly-out animation
      if (animation) {
        const elapsed = now - animation.startTime;
        const progress = Math.min(elapsed / animation.duration, 1);

        // Ease-out exponential
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

        const currentX = animation.startX + (animation.targetX - animation.startX) * eased;
        const currentY = animation.startY + (animation.targetY - animation.startY) * eased;
        const currentRadius = animation.startRadius + (animation.targetRadius - animation.startRadius) * eased;

        setSpotlight(prev => ({
          ...prev,
          x: currentX,
          y: currentY,
          radius: currentRadius,
          animating: progress < 1,
        }));

        if (progress < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          setAnimation(null);
        }
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [animation, fadingOut, fadeStartTime]);

  return spotlight;
}
