document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('spotlight-canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas to full screen size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const circleRadius = 100;
  let mouseX = canvas.width / 2;
  let mouseY = canvas.height / 2;

  function drawCircle() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw circle
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, circleRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.stroke();
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
