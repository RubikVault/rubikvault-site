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

  // Tab-Funktionalität für Assets Section
  const tabs = document.querySelectorAll(".rv-tab-item");
  const contents = document.querySelectorAll(".rv-content-area > div");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Entferne aktive Klassen von allen Tabs und Inhalten
      tabs.forEach((t) => t.classList.remove("rv-tab-active"));
      contents.forEach((c) => c.classList.remove("rv-content-active"));

      // Füge die aktive Klasse zum geklickten Tab hinzu
      tab.classList.add("rv-tab-active");

      // Bestimme den Index des geklickten Tabs
      const index = Array.from(tabs).indexOf(tab);

      // Zeige den entsprechenden Inhalt an
      if (contents[index]) {
        contents[index].classList.add("rv-content-active");
      }
    });
  });
  
  // Setze den ersten Tab als aktiv, falls keiner aktiv ist
  if (tabs.length > 0 && !document.querySelector(".rv-tab-active")) {
    tabs[0].classList.add("rv-tab-active");
    contents[0].classList.add("rv-content-active");
  }
});