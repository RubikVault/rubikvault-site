// script.js

document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".rv-header");

  // Shadow / Hintergrund beim Scrollen anpassen
  window.addEventListener("scroll", () => {
    if (window.scrollY > 10) {
      header.classList.add("rv-header-scrolled");
    } else {
      header.classList.remove("rv-header-scrolled");
    }
  });

  // Smooth Scroll für interne Anchor-Links
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetId = link.getAttribute("href").substring(1);
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
});