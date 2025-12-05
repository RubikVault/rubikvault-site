// Minimal JS to keep things lightweight

document.addEventListener("DOMContentLoaded", () => {
  // Set current year in footer
  const yearSpan = document.getElementById("rv-year");
  if (yearSpan) {
    const now = new Date();
    yearSpan.textContent = now.getFullYear();
  }

  // Optional: smooth scroll for internal links (anchor tags starting with #)
  const internalLinks = document.querySelectorAll('a[href^="#"]');
  internalLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      event.preventDefault();
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
});
