document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('spotlight-canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas to full screen size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const circleRadius = 150; // Increased from 100
  const fadeSize = 60; // Size of the gradient fade
  let mouseX = canvas.width / 2;
  let mouseY = canvas.height / 2;

  function drawSpotlight() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill entire canvas with dark overlay (65% opacity)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create radial gradient for spotlight hole with soft edges
    const gradient = ctx.createRadialGradient(
      mouseX, mouseY, circleRadius - fadeSize,  // Inner circle (fully transparent)
      mouseX, mouseY, circleRadius + fadeSize   // Outer circle (fades to overlay)
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');     // Fully cut out center
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)'); // Mid fade
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');     // Blend into overlay

    // Use destination-out to cut the spotlight hole
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, circleRadius + fadeSize, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';

    // Draw very subtle warm halo glow around spotlight edge
    const haloGradient = ctx.createRadialGradient(
      mouseX, mouseY, circleRadius - 5,
      mouseX, mouseY, circleRadius + 35
    );
    haloGradient.addColorStop(0, 'rgba(255, 252, 245, 0)');
    haloGradient.addColorStop(0.5, 'rgba(255, 248, 235, 0.1)');
    haloGradient.addColorStop(0.8, 'rgba(255, 245, 225, 0.06)');
    haloGradient.addColorStop(1, 'rgba(255, 240, 220, 0)');

    ctx.beginPath();
    ctx.arc(mouseX, mouseY, circleRadius + 40, 0, 2 * Math.PI);
    ctx.fillStyle = haloGradient;
    ctx.fill();
  }

  // Listen for global mouse move events from main process
  if (window.electronAPI?.onGlobalMouseMove) {
    window.electronAPI.onGlobalMouseMove((data) => {
      mouseX = data.position.x;
      mouseY = data.position.y;
      drawSpotlight();
    });
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawSpotlight();
  });

  // Initial draw
  drawSpotlight();
});
