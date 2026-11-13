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
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
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

    const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;

    const resetWidget = () => {
      latestTokenRef.current = "";
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

      if (widgetIdRef.current && window.turnstile) {
        try {
          const response = window.turnstile.getResponse(widgetIdRef.current);
          if (response && response.trim().length > 0) {
            latestTokenRef.current = response;
            return response;
          }
        } catch (e) {
          // ignore
        }
      }

      if (latestTokenRef.current && latestTokenRef.current.trim().length > 0) {
        return latestTokenRef.current;
      }

      return new Promise<string>((resolve) => {
        let completed = false;
        const timer = setTimeout(() => {
          if (!completed) {
            completed = true;
            resolve(latestTokenRef.current || "");
          }
        }, 8000);

        pendingResolvers.current.push((t: string) => {
          if (!completed) {
            completed = true;
            clearTimeout(timer);
            resolve(t);
          }
        });

        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.execute(widgetIdRef.current);
          } catch (e) {
            // ignore
          }
        }
      });
    };

    useImperativeHandle(ref, () => ({
      reset: resetWidget,
      getToken,
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

      const existingScript = document.getElementById("cf-turnstile-script");

      const renderWidget = () => {
        if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;

        try {
          const id = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            "refresh-expired": "auto",
            retry: "auto",
            "retry-interval": 1000,
            callback: (token: string) => {
              latestTokenRef.current = token;
              onVerify(token);
              const resolvers = [...pendingResolvers.current];
              pendingResolvers.current = [];
              resolvers.forEach((r) => r(token));
            },
            "expired-callback": () => {
              latestTokenRef.current = "";
              onVerify("");
              if (onExpire) onExpire();
              const resolvers = [...pendingResolvers.current];
              pendingResolvers.current = [];
              resolvers.forEach((r) => r(""));
            },
            "error-callback": () => {
              latestTokenRef.current = "";
              onVerify("");
              if (onError) onError();
              const resolvers = [...pendingResolvers.current];
              pendingResolvers.current = [];
              resolvers.forEach((r) => r(""));
            },
          });
          widgetIdRef.current = id;
        } catch (err) {
          console.error("[TurnstileWidget] Error rendering Turnstile widget:", err);
        }
      };

      if (window.turnstile) {
        renderWidget();
      } else if (!existingScript) {
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

      return () => {
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
      <div className={`flex justify-center items-center ${className}`}>
        <div ref={containerRef} />
      </div>
    );
  }
);

TurnstileWidget.displayName = "TurnstileWidget";

export default TurnstileWidget;
