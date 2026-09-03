(function () {
  const root = document.documentElement;
  const STORAGE_KEY = "wiki-theme";

  /* ---------- Theme toggle ---------- */
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function effectiveTheme() {
    const explicit = root.getAttribute("data-theme");
    if (explicit === "dark" || explicit === "light") return explicit;
    return systemPrefersDark() ? "dark" : "light";
  }

  const themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = effectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (error) {
        /* storage may be unavailable; theme still applies for this session */
      }
    });
  }

  /* ---------- Mobile navigation drawer ---------- */
  const navToggle = document.querySelector(".nav-toggle");
  const scrim = document.getElementById("nav-scrim");

  function closeNav() {
    document.body.classList.remove("nav-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle) {
    navToggle.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  if (scrim) scrim.addEventListener("click", closeNav);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNav();
  });
  /* Close the drawer after following an in-sidebar link on mobile. */
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNav();
    });
  }

  /* ---------- Regenerate (local dev server only) ---------- */
  const regen = document.querySelector(".regen-toggle");
  if (regen) {
    // The button only works under scripts/serve.mjs, which answers this probe.
    // On static/Vercel hosting the request fails and the button stays hidden.
    fetch("/api/regenerate", { method: "GET" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && data.capable) regen.hidden = false;
      })
      .catch(() => {
        /* not served by the dev server; leave the button hidden */
      });

    const defaultTitle = regen.getAttribute("title") || "Regenerate";
    regen.addEventListener("click", async () => {
      if (regen.classList.contains("busy")) return;
      regen.classList.remove("error");
      regen.classList.add("busy");
      regen.title = "Regenerating…";
      try {
        const response = await fetch("/api/regenerate", { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.ok) {
          location.reload();
          return;
        }
        regen.classList.add("error");
        regen.title = "Regenerate failed — check the dev-server terminal";
        if (data && data.output) console.error("[regenerate]\n" + data.output);
      } catch (error) {
        regen.classList.add("error");
        regen.title = "Regenerate request failed";
        console.error(error);
      } finally {
        regen.classList.remove("busy");
        if (regen.title === "Regenerating…") regen.title = defaultTitle;
        window.setTimeout(() => {
          regen.classList.remove("error");
          regen.title = defaultTitle;
        }, 5000);
      }
    });
  }

  /* ---------- Sidebar filter ---------- */
  const filter = document.getElementById("nav-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      const query = filter.value.trim().toLowerCase();
      const items = document.querySelectorAll(".nav-plan, .nav-sub");

      for (const item of items) {
        const visible = !query || item.textContent.toLowerCase().includes(query);
        item.classList.toggle("is-hidden", !visible);
        if (visible && query) {
          const parent = item.closest("details");
          if (parent) parent.open = true;
        }
      }
    });
  }
})();
