// 1. Select all necessary elements
const bg = document.getElementById("bg");
const text = document.getElementById("text");
const foliage = document.getElementById("foliage");
const startBtn = document.querySelector(".start-btn");

// 2. Define scroll speed rates (Parallax intensity)
const rates = {
  bg: 0.5,      // Moves at 50% scroll speed
  foliage: 0.15, // Moves slowly for depth
  text: 1        // Moves at 1:1 ratio with scroll
};

/**
 * Handle the scroll logic
 */
const handleScroll = () => {
  // Current vertical scroll position
  const scrollDistance = window.scrollY;

  // --- PARALLAX SECTION ---
  // Move the background city image
  if (bg) {
    bg.style.top = `${scrollDistance * rates.bg}px`;
  }

  // Move the foliage (if it exists)
  if (foliage) {
    foliage.style.top = `${scrollDistance * rates.foliage}px`;
  }

  // Move the welcome text
  if (text) {
    text.style.top = `${scrollDistance * rates.text}px`;
    
    // Optional: Fades text out as you scroll deeper
    // text.style.opacity = 1 - (scrollDistance / 600);
  }

  // --- BUTTON REVEAL SECTION ---
  // We use 450px as the threshold for a "later" reveal. 
  // You can increase this number to delay it even further.
  if (scrollDistance > 450) {
    startBtn.classList.add("show");
  } else {
    startBtn.classList.remove("show");
  }
};

// 3. Listen for the scroll event
window.addEventListener('scroll', handleScroll);

// 4. Smooth Scroll for the Start Button
// This ensures that when they click "Start", it slides down elegantly.
startBtn.addEventListener('click', (e) => {
  const targetId = startBtn.getAttribute('href');
  
  // Only intercept if the link is an anchor (starts with #)
  if (targetId.startsWith('#')) {
    e.preventDefault();
    const destination = document.querySelector(targetId);
    
    if (destination) {
      destination.scrollIntoView({
        behavior: 'smooth'
      });
    }
  }
});