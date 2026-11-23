"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";

export interface TurnstileRef {
  reset: () => void;
  getToken: () => Promise<string>;
  getError: () => string | null;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (errorCode?: any) => void;
  className?: string;
  theme?: "light" | "dark" | "auto";
  resetKey?: any;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: (error: any) => void;
          theme?: "light" | "dark" | "auto";
          "refresh-expired"?: "auto" | "manual" | "never";
          retry?: "auto" | "never";
          "retry-interval"?: number;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      execute: (widgetId: string) => void;
      getResponse: (widgetId: string) => string;
    };
  }
}

const TurnstileWidget = forwardRef<TurnstileRef, TurnstileWidgetProps>(
  (
    {
      onVerify,
      onExpire,
      onError,
      className = "my-3",
      theme = "light",
      resetKey,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const latestTokenRef = useRef<string>("");
    const pendingResolvers = useRef<((token: string) => void)[]>([]);
    const [turnstileError, setTurnstileError] = useState<string | null>(null);
    const turnstileErrorRef = useRef<string | null>(null);
    const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");

    const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;

    const resetWidget = () => {
      latestTokenRef.current = "";
      turnstileErrorRef.current = null;
      setTurnstileError(null);
      setStatus("initializing");
      onVerify("");
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch (e) {
          console.warn("[TurnstileWidget] Reset error:", e);
        }
      }
    };

    const getToken = async (): Promise<string> => {
      if (!siteKey || typeof window === "undefined") {
        return "";
      }

      if (turnstileErrorRef.current || turnstileError) {
        return "";
      }

      // 1. If Turnstile already has a token ready in getResponse()
      if (widgetIdRef.current && window.turnstile) {
        try {
          const response = window.turnstile.getResponse(widgetIdRef.current);
          if (response && response.trim().length > 0) {
            latestTokenRef.current = response;
            setStatus("ready");
            return response;
          }
        } catch (e) {
          // ignore
        }
      }

      if (latestTokenRef.current && latestTokenRef.current.trim().length > 0) {
        setStatus("ready");
        return latestTokenRef.current;
      }

      // 2. If the widget is still loading or initializing, wait up to 8s for it
      if (!window.turnstile || !widgetIdRef.current) {
        await new Promise<void>((resolve) => {
          let elapsed = 0;
          const poll = setInterval(() => {
            elapsed += 100;
            if (
              (window.turnstile && widgetIdRef.current) ||
              turnstileErrorRef.current ||
              elapsed >= 8000
            ) {
              clearInterval(poll);
              resolve();
            }
          }, 100);
        });
      }

      if (turnstileErrorRef.current) {
        return "";
      }

      // Re-check getResponse() after waiting for widget initialization
      if (widgetIdRef.current && window.turnstile) {
        try {
          const response = window.turnstile.getResponse(widgetIdRef.current);
          if (response && response.trim().length > 0) {
            latestTokenRef.current = response;
            setStatus("ready");
            return response;
          }
        } catch (e) {
          // ignore
        }
      }

      if (latestTokenRef.current && latestTokenRef.current.trim().length > 0) {
        setStatus("ready");
        return latestTokenRef.current;
      }

      // 3. Await token generation or execute widget
      if (widgetIdRef.current && window.turnstile) {
        return new Promise<string>((resolve) => {
          let completed = false;
          const timer = setTimeout(() => {
            if (!completed) {
              completed = true;
              resolve(latestTokenRef.current || "");
            }
          }, 10000);

          pendingResolvers.current.push((t: string) => {
            if (!completed) {
              completed = true;
              clearTimeout(timer);
              resolve(t);
            }
          });

          try {
            window.turnstile.execute(widgetIdRef.current);
          } catch (e) {
            // Widget might already be evaluating, safe to catch
          }
        });
      }

      return latestTokenRef.current || "";
    };

    useImperativeHandle(ref, () => ({
      reset: resetWidget,
      getToken,
      getError: () => turnstileErrorRef.current || turnstileError,
    }));

    useEffect(() => {
      if (resetKey !== undefined && widgetIdRef.current && window.turnstile) {
        resetWidget();
      }
    }, [resetKey]);

    useEffect(() => {
      if (!siteKey) {
        onVerify("");
        return;
      }

      let isMounted = true;
      let pollTimer: NodeJS.Timeout | null = null;

      const renderWidget = () => {
        if (!isMounted || !window.turnstile || !containerRef.current) return;
        if (widgetIdRef.current) return;

        try {
          // Clean existing children if container was pre-populated
          containerRef.current.innerHTML = "";

          const id = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            "refresh-expired": "auto",
            retry: "never",
            callback: (token: string) => {
              latestTokenRef.current = token;
              setStatus("ready");
              onVerify(token);
              const resolvers = [...pendingResolvers.current];
              pendingResolvers.current = [];
              resolvers.forEach((r) => r(token));
            },
            "expired-callback": () => {
              latestTokenRef.current = "";
              setStatus("initializing");
              onVerify("");
              if (onExpire) onExpire();
              const resolvers = [...pendingResolvers.current];
              pendingResolvers.current = [];
              resolvers.forEach((r) => r(""));
            },
            "error-callback": (error: any) => {
              const errStr = typeof error === "string" ? error : error?.code || String(error || "");
              console.warn("[TurnstileWidget] Cloudflare error:", errStr);
              latestTokenRef.current = "";
              turnstileErrorRef.current = errStr;
              setTurnstileError(errStr);
              setStatus("error");
              onVerify("");
              if (onError) onError(errStr);
              const resolvers = [...pendingResolvers.current];
              pendingResolvers.current = [];
              resolvers.forEach((r) => r(""));
            },
          });
          widgetIdRef.current = id;
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } catch (err) {
          console.error("[TurnstileWidget] Error rendering Turnstile widget:", err);
        }
      };

      const existingScript = document.getElementById("cf-turnstile-script");

      if (window.turnstile) {
        renderWidget();
      } else {
        if (!existingScript) {
          const script = document.createElement("script");
          script.id = "cf-turnstile-script";
          script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.async = true;
          script.defer = true;
          script.onload = () => {
            renderWidget();
          };
          document.head.appendChild(script);
        } else {
          existingScript.addEventListener("load", () => {
            renderWidget();
          });
        }

        // Resilient polling interval: handles existing scripts that already loaded,
        // or cases where the load event was missed during re-mount
        pollTimer = setInterval(() => {
          if (window.turnstile && containerRef.current && !widgetIdRef.current) {
            renderWidget();
          }
        }, 100);
      }

      return () => {
        isMounted = false;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch (e) {
            // ignore
          }
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, theme]);

    if (!siteKey) {
      return null;
    }

    return (
      <div className={`flex flex-col justify-center items-center ${className}`}>
        <div ref={containerRef} />
        {status === "initializing" && !turnstileError && (
          <div className="flex items-center gap-1.5 py-1 text-[11px] text-slate-500 animate-pulse">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
            <span>Securing session with Cloudflare...</span>
          </div>
        )}
        {status === "ready" && !turnstileError && (
          <div className="flex items-center gap-1.5 py-1 text-[11px] font-medium text-emerald-600">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-700">✓</span>
            <span>Security check verified</span>
          </div>
        )}
        {turnstileError && (
          <div className="mt-2 w-full rounded-2xl border border-amber-300 bg-amber-50 p-2.5 text-center text-xs text-amber-900 leading-snug">
            ⚠️ <strong>Cloudflare Turnstile Error {turnstileError === "600010" ? "600010 (Domain Mismatch)" : `(${turnstileError})`}:</strong>
            <p className="mt-1 text-[11px] text-amber-800">
              {turnstileError === "600010"
                ? `Domain '${typeof window !== "undefined" ? window.location.hostname : ""}' must be added to Allowed Domains in Cloudflare Dashboard for this sitekey.`
                : "Security verification could not be completed by Cloudflare."}
            </p>
          </div>
        )}
      </div>
    );
  }
);

TurnstileWidget.displayName = "TurnstileWidget";

export default TurnstileWidget;
