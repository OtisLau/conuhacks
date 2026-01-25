document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('spotlight-canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas to full screen size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const circleRadius = 60;
  const haloRadius = 120;
  let mouseX = canvas.width / 2;
  let mouseY = canvas.height / 2;

  function drawCircle() {
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
  }

  // Listen for global mouse move events from main process
  if (window.electronAPI?.onGlobalMouseMove) {
    window.electronAPI.onGlobalMouseMove((data) => {
      mouseX = data.position.x;
      mouseY = data.position.y;
      drawCircle();
    });
  }

  // Initial draw
  drawCircle();
});
