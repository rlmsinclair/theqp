// THE QPAI - Pie Theme Enhancements
// Welcome to the cutiepie!

// Add floating pie slices to background
function addFloatingSlices() {
  const slices = ['🥧', '🍰', '🍕', '🔺'];
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  `;
  
  // Create 15 floating slices
  for (let i = 0; i < 15; i++) {
    const slice = document.createElement('div');
    slice.textContent = slices[Math.floor(Math.random() * slices.length)];
    slice.style.cssText = `
      position: absolute;
      font-size: ${20 + Math.random() * 30}px;
      opacity: 0.03;
      left: ${Math.random() * 100}%;
      animation: floatUp ${15 + Math.random() * 10}s linear infinite;
      animation-delay: ${Math.random() * 15}s;
    `;
    container.appendChild(slice);
  }
  
  document.body.appendChild(container);
}

// Add CSS animations
function addPieAnimations() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatUp {
      from {
        transform: translateY(100vh) rotate(0deg);
      }
      to {
        transform: translateY(-100px) rotate(360deg);
      }
    }
    
    @keyframes cutSlice {
      0% { transform: scale(1) rotate(0deg); }
      50% { transform: scale(1.1) rotate(-5deg); }
      100% { transform: scale(1) rotate(0deg); }
    }
    
    /* Add slice animation to buttons on hover */
    button:hover {
      animation: cutSlice 0.5s ease-in-out;
    }
    
    /* Special effect for cut button */
    #checkButton::before {
      content: "✂️";
      position: absolute;
      left: -30px;
      opacity: 0;
      transition: all 0.3s ease;
    }
    
    #checkButton:hover::before {
      left: 20px;
      opacity: 1;
    }
    
    /* Pie celebration */
    @keyframes pieExplosion {
      0% {
        transform: scale(1) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: scale(3) rotate(720deg);
        opacity: 0;
      }
    }
    
    .pie-celebration {
      position: fixed;
      font-size: 50px;
      animation: pieExplosion 1s ease-out forwards;
      pointer-events: none;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);
}

// Celebrate when someone cuts their slice
function celebrateSliceCut(x, y) {
  const emojis = ['🥧', '🍰', '✨', '🎉'];
  
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const celebration = document.createElement('div');
      celebration.className = 'pie-celebration';
      celebration.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      celebration.style.left = (x + (Math.random() - 0.5) * 100) + 'px';
      celebration.style.top = (y + (Math.random() - 0.5) * 100) + 'px';
      document.body.appendChild(celebration);
      
      setTimeout(() => celebration.remove(), 1000);
    }, i * 100);
  }
}

// Update button text with pie theme
function updateButtonText() {
  const checkButton = document.getElementById('checkButton');
  if (checkButton && !checkButton.textContent.includes('🥧')) {
    checkButton.innerHTML = '🥧 Cut My Slice';
  }
  
  const payButton = document.getElementById('payButton');
  if (payButton && !payButton.textContent.includes('✂️')) {
    payButton.innerHTML = '✂️ Cut & Claim Forever';
  }
}

// Add slice counter animation
function animateSliceCounter(element, start, end, duration) {
  const range = end - start;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const current = Math.floor(start + range * progress);
    element.textContent = current.toLocaleString();
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// Initialize pie theme
function initPieTheme() {
  addFloatingSlices();
  addPieAnimations();
  updateButtonText();
  
  // Add click celebration to cut button
  const checkButton = document.getElementById('checkButton');
  if (checkButton) {
    checkButton.addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      celebrateSliceCut(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
    });
  }
  
  // Animate stats on load
  const claimedCount = document.getElementById('claimedCount');
  if (claimedCount && claimedCount.textContent !== '...') {
    const value = parseInt(claimedCount.textContent.replace(/,/g, ''));
    if (!isNaN(value)) {
      animateSliceCounter(claimedCount, 0, value, 1000);
    }
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPieTheme);
} else {
  initPieTheme();
}

// Export for use in other scripts
window.pieTheme = {
  celebrate: celebrateSliceCut,
  animateCounter: animateSliceCounter
};