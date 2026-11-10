import { NextResponse } from "next/server";

export async function GET() {
  const scriptContent = `
(function () {
  if (window.__SMK_CHATBOT_INITIALIZED__) return;
  window.__SMK_CHATBOT_INITIALIZED__ = true;

  const scriptTag = document.currentScript;
  const baseUrl = (scriptTag && scriptTag.src) 
    ? new URL(scriptTag.src).origin 
    : "http://localhost:8005";

  // Opened by default
  let isOpen = true;

  function isMobile() {
    return window.innerWidth <= 640;
  }

  // Create launcher button
  const button = document.createElement("button");
  button.id = "smk-chatbot-launcher";
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span style="font-weight:600;font-size:13px;font-family:system-ui,-apple-system,sans-serif;">Ask Assistant</span>';

  function updateButtonStyles() {
    const mobile = isMobile();
    Object.assign(button.style, {
      position: "fixed",
      bottom: mobile ? "16px" : "28px",
      right: mobile ? "16px" : "96px",
      zIndex: "99999",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: mobile ? "9px 15px" : "10px 18px",
      borderRadius: "9999px",
      backgroundColor: isOpen ? "#0f172a" : "#0284c7",
      color: "#ffffff",
      border: "none",
      boxShadow: mobile ? "0 8px 20px -4px rgba(2, 132, 199, 0.5)" : "0 10px 25px -5px rgba(2, 132, 199, 0.4)",
      cursor: "pointer",
      transition: "transform 0.2s, box-shadow 0.2s, background-color 0.2s",
    });
  }

  button.onmouseenter = () => { button.style.transform = "scale(1.05)"; };
  button.onmouseleave = () => { button.style.transform = "scale(1)"; };

  // Create iframe container
  const iframe = document.createElement("iframe");
  iframe.id = "smk-chatbot-iframe";
  iframe.src = baseUrl + "/widget";
  iframe.title = "SMK AI Assistant";
  iframe.allow = "clipboard-write";

  function applyIframeStyles() {
    if (!isOpen) {
      iframe.style.display = "none";
      updateButtonStyles();
      return;
    }

    iframe.style.display = "block";
    const mobile = isMobile();

    Object.assign(iframe.style, {
      position: "fixed",
      bottom: mobile ? "76px" : "84px",
      right: mobile ? "16px" : "32px",
      width: mobile ? "calc(100vw - 32px)" : "400px",
      height: mobile ? "calc(100dvh - 96px)" : "540px",
      maxWidth: mobile ? "420px" : "calc(100vw - 40px)",
      maxHeight: "calc(100vh - 100px)",
      border: "none",
      borderRadius: "28px",
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      zIndex: "999999",
      background: "transparent",
    });

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
      applyIframeStyles();
    }
  });

  window.addEventListener("resize", () => {
    applyIframeStyles();
  });

  // Opened by default
  applyIframeStyles();
  document.body.appendChild(button);
  document.body.appendChild(iframe);
})();
`;

  return new NextResponse(scriptContent, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
