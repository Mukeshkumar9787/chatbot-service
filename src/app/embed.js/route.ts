import { NextResponse } from "next/server";

export async function GET(req: Request) {
  let serverOrigin = "https://chatbot-service-three.vercel.app";
  try {
    const url = new URL(req.url);
    if (url.origin) {
      serverOrigin = url.origin;
    }
  } catch (e) {}

  const scriptContent = `
(function () {
  if (window.__SMK_CHATBOT_INITIALIZED__) return;
  window.__SMK_CHATBOT_INITIALIZED__ = true;

  let scriptTag = document.currentScript;
  if (!scriptTag) {
    scriptTag =
      document.getElementById("smk-chatbot-embed-script") ||
      document.querySelector('script[src*="/embed.js"]') ||
      document.querySelector('script[data-tenant-slug]') ||
      document.querySelector('script[data-tenant-id]');
  }

  let scriptUrl = null;
  try {
    if (scriptTag && scriptTag.src) {
      scriptUrl = new URL(scriptTag.src, window.location.href);
    }
  } catch (e) {}

  const baseUrl = scriptUrl ? scriptUrl.origin : "${serverOrigin}";
  const pagePathSegments = (typeof window !== "undefined" && window.location) ? window.location.pathname.split("/").filter(Boolean) : [];
  const pathTenant = (pagePathSegments.length >= 2 && pagePathSegments[0] === "s") ? pagePathSegments[1] : (pagePathSegments.length > 0 && !["admin", "api", "widget", "support"].includes(pagePathSegments[0]) ? pagePathSegments[0] : "");

  const tenantSlug =
    (scriptUrl && scriptUrl.searchParams.get("tenant")) ||
    (scriptTag && scriptTag.getAttribute("data-tenant-slug")) ||
    pathTenant ||
    "";
  const tenantId =
    (scriptUrl && scriptUrl.searchParams.get("tenantId")) ||
    (scriptTag && scriptTag.getAttribute("data-tenant-id")) ||
    "";
  const storeName =
    (scriptUrl && scriptUrl.searchParams.get("storeName")) ||
    (scriptTag && scriptTag.getAttribute("data-store-name")) ||
    "";
  let primaryColor =
    (scriptUrl && scriptUrl.searchParams.get("primaryColor")) ||
    (scriptTag && scriptTag.getAttribute("data-primary-color")) ||
    "#0284c7";
  let accentColor =
    (scriptUrl && scriptUrl.searchParams.get("accentColor")) ||
    (scriptTag && scriptTag.getAttribute("data-accent-color")) ||
    "#0ea5e9";
  let assistantName =
    (scriptUrl && scriptUrl.searchParams.get("assistantName")) ||
    (scriptTag && scriptTag.getAttribute("data-assistant-name")) ||
    "";
  let fontFamily =
    (scriptUrl && scriptUrl.searchParams.get("fontFamily")) ||
    (scriptTag && scriptTag.getAttribute("data-font-family")) ||
    "Inter";

  // Auto-open only once. Stored in localStorage so it persists across reloads, tabs, and windows.
  const AUTO_OPEN_STORAGE_KEY = "smk_chatbot_has_auto_opened";

  function hasAutoOpened() {
    try {
      return Boolean(
        window.localStorage &&
        window.localStorage.getItem(AUTO_OPEN_STORAGE_KEY) === "true"
      );
    } catch (e) {
      return false;
    }
  }

  function markAutoOpened() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(AUTO_OPEN_STORAGE_KEY, "true");
      }
    } catch (e) {}
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  // Do not auto-open on mobile screens. On desktop, auto-open once and persist across tabs/reloads.
  let isOpen = !isMobile() && !hasAutoOpened();
  if (isOpen) {
    markAutoOpened();
  }

  // Inject heartbeat effect stylesheet for launcher button
  if (typeof document !== "undefined" && !document.getElementById("smk-chatbot-styles")) {
    const styleTag = document.createElement("style");
    styleTag.id = "smk-chatbot-styles";
    styleTag.textContent = [
      "@keyframes smk-heartbeat {",
      "  0% { transform: scale(1); box-shadow: 0 8px 20px -4px rgba(2, 132, 199, 0.4); }",
      "  14% { transform: scale(1.08); box-shadow: 0 12px 28px -2px rgba(2, 132, 199, 0.65); }",
      "  28% { transform: scale(1); box-shadow: 0 8px 20px -4px rgba(2, 132, 199, 0.4); }",
      "  42% { transform: scale(1.08); box-shadow: 0 12px 28px -2px rgba(2, 132, 199, 0.65); }",
      "  70% { transform: scale(1); box-shadow: 0 8px 20px -4px rgba(2, 132, 199, 0.4); }",
      "  100% { transform: scale(1); box-shadow: 0 8px 20px -4px rgba(2, 132, 199, 0.4); }",
      "}",
      "#smk-chatbot-launcher.smk-heartbeat {",
      "  animation: smk-heartbeat 2.2s ease-in-out infinite;",
      "  transform-origin: center center;",
      "  will-change: transform, box-shadow;",
      "}",
      "#smk-chatbot-launcher.smk-heartbeat:hover {",
      "  animation-play-state: paused;",
      "  transform: scale(1.06);",
      "}"
    ].join("\\n");
    document.head.appendChild(styleTag);
  }

  // Create launcher button
  const launcherLabel = assistantName || (storeName ? storeName + " Assistant" : "Ask Assistant");
  const button = document.createElement("button");
  button.id = "smk-chatbot-launcher";
  button.className = "smk-heartbeat";
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span style="font-weight:600;font-size:13px;font-family:\'' + fontFamily + '\',system-ui,-apple-system,sans-serif;">' + launcherLabel + '</span>';

  function updateButtonStyles() {
    const mobile = isMobile();
    // On mobile when chat assistant is opened, hide launcher button so it doesn't obstruct full screen UI
    if (mobile && isOpen) {
      button.style.display = "none";
      return;
    }

    button.style.display = "flex";
    Object.assign(button.style, {
      position: "fixed",
      bottom: mobile ? "16px" : "28px",
      right: mobile ? "16px" : "96px",
      zIndex: "99999",
      alignItems: "center",
      gap: "8px",
      padding: mobile ? "9px 15px" : "10px 18px",
      borderRadius: "9999px",
      backgroundColor: isOpen ? "#0f172a" : primaryColor,
      color: "#ffffff",
      border: "none",
      boxShadow: mobile ? "0 8px 20px -4px rgba(2, 132, 199, 0.5)" : "0 10px 25px -5px rgba(2, 132, 199, 0.4)",
      cursor: "pointer",
      transition: "box-shadow 0.2s, background-color 0.2s",
    });
  }

  // Create iframe container
  const iframe = document.createElement("iframe");
  iframe.id = "smk-chatbot-iframe";
  const widgetParams = new URLSearchParams();
  if (tenantSlug) widgetParams.set("tenant", tenantSlug);
  if (tenantId) widgetParams.set("tenantId", tenantId);
  if (storeName) widgetParams.set("storeName", storeName);
  if (primaryColor) widgetParams.set("primaryColor", primaryColor);
  if (accentColor) widgetParams.set("accentColor", accentColor);
  if (assistantName) widgetParams.set("assistantName", assistantName);
  if (fontFamily) widgetParams.set("fontFamily", fontFamily);
  const widgetQuery = widgetParams.toString() ? ("?" + widgetParams.toString()) : "";
  iframe.src = baseUrl + "/widget" + widgetQuery;
  iframe.title = launcherLabel;
  iframe.allow = "clipboard-write";

  if (tenantSlug) {
    try {
      fetch(baseUrl + "/api/" + encodeURIComponent(tenantSlug) + "/status")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && (data.active === false || data.status === "INACTIVE")) {
            button.style.display = "none";
            iframe.style.display = "none";
            return;
          }
          if (data && data.branding) {
            if (data.branding.primaryColor) {
              primaryColor = data.branding.primaryColor;
              if (!isOpen) button.style.backgroundColor = primaryColor;
            }
            if (data.branding.fontFamily) {
              fontFamily = data.branding.fontFamily;
              const labelSpan = button.querySelector("span");
              if (labelSpan) labelSpan.style.fontFamily = "'" + fontFamily + "', system-ui, sans-serif";
            }
            if (data.branding.assistantName) {
              const labelSpan = button.querySelector("span");
              if (labelSpan) labelSpan.textContent = data.branding.assistantName;
            }
          }
        })
        .catch(function () {});
    } catch (e) {}
  }

  function applyIframeStyles() {
    if (!isOpen) {
      iframe.style.display = "none";
      updateButtonStyles();
      return;
    }

    iframe.style.display = "block";
    const mobile = isMobile();

    if (mobile) {
      // Full screen on mobile screens when opened
      Object.assign(iframe.style, {
        position: "fixed",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        width: "100vw",
        height: "100%",
        maxWidth: "100vw",
        maxHeight: "100%",
        border: "none",
        borderRadius: "0px",
        boxShadow: "none",
        zIndex: "999999",
        background: "#ffffff",
      });
      try {
        iframe.style.height = "100dvh";
        iframe.style.maxHeight = "100dvh";
      } catch (e) {}
    } else {
      // Desktop floating widget
      Object.assign(iframe.style, {
        position: "fixed",
        top: "auto",
        left: "auto",
        bottom: "84px",
        right: "32px",
        width: "400px",
        height: "540px",
        maxWidth: "calc(100vw - 40px)",
        maxHeight: "calc(100vh - 100px)",
        border: "none",
        borderRadius: "28px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        zIndex: "999999",
        background: "transparent",
      });
    }

    updateButtonStyles();
  }

  function toggleChat() {
    isOpen = !isOpen;
    applyIframeStyles();
  }

  button.onclick = toggleChat;

  window.addEventListener("message", (event) => {
    if (event.data?.type === "CLOSE_SMK_CHATBOT") {
      isOpen = false;
      markAutoOpened();
      applyIframeStyles();
    }
  });

  window.addEventListener("resize", () => {
    applyIframeStyles();
  });

  function mount() {
    applyIframeStyles();
    if (document.body) {
      if (button.parentNode !== document.body) {
        document.body.appendChild(button);
      }
      if (iframe.parentNode !== document.body) {
        document.body.appendChild(iframe);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
`;

  return new NextResponse(scriptContent, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
