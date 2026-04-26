// landingpage.js — parallax scroll + button reveal
const bg      = document.getElementById("bg");
const text    = document.getElementById("text");
const startBtn = document.getElementById("start-btn");

const rates = { bg: 0.4, text: 0.7 };

const handleScroll = () => {
    const y = window.scrollY;
    if (bg)   bg.style.transform   = `translateY(${y * rates.bg}px)`;
    if (text) text.style.transform = `translateY(${y * rates.text}px)`;
};

window.addEventListener("scroll", handleScroll, { passive: true });
