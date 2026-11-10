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

  // Create launcher button
  const button = document.createElement("button");
  button.id = "smk-chatbot-launcher";
  button.innerHTML = '<img src="' + baseUrl + '/images/logo/smk.jpg" style="width:20px;height:20px;border-radius:6px;object-fit:contain;" alt="SMK" /><span style="font-weight:600;font-size:13px;font-family:system-ui,-apple-system,sans-serif;">Ask Assistant</span>';
  Object.assign(button.style, {
    position: "fixed",
    bottom: "28px",
    right: "96px",
    zIndex: "99999",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 18px",
    borderRadius: "9999px",
    backgroundColor: "#0284c7",
    color: "#ffffff",
    border: "none",
    boxShadow: "0 10px 25px -5px rgba(2, 132, 199, 0.4)",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
  });

  button.onmouseenter = () => { button.style.transform = "scale(1.05)"; };
  button.onmouseleave = () => { button.style.transform = "scale(1)"; };

  // Create iframe container
  const iframe = document.createElement("iframe");
  iframe.id = "smk-chatbot-iframe";
  iframe.src = baseUrl + "/widget";
  Object.assign(iframe.style, {
    position: "fixed",
    bottom: "84px",
    right: "32px",
    width: "400px",
    height: "540px",
    maxWidth: "calc(100vw - 40px)",
    maxHeight: "calc(100vh - 110px)",
    border: "none",
    borderRadius: "28px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    zIndex: "999999",
    display: "none",
    background: "transparent",
  });

  let isOpen = false;

  function toggleChat() {
    isOpen = !isOpen;
    iframe.style.display = isOpen ? "block" : "none";
    button.style.backgroundColor = isOpen ? "#0f172a" : "#0284c7";
  }

  button.onclick = toggleChat;

  window.addEventListener("message", (event) => {
    if (event.data?.type === "CLOSE_SMK_CHATBOT") {
      isOpen = false;
      iframe.style.display = "none";
      button.style.backgroundColor = "#0284c7";
    }
  });

  document.body.appendChild(button);
  document.body.appendChild(iframe);
})();
`;

  return new NextResponse(scriptContent, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

