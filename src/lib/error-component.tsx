import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

function isStaleChunk(message: string) {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    message,
  );
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = error.message || "An unexpected error occurred. Try reloading the page.";
  const stale = isStaleChunk(message);

  useEffect(() => {
    if (!stale || typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("jmg-chunk-reload") === "1") return;
      sessionStorage.setItem("jmg-chunk-reload", "1");
    } catch {
      return;
    }
    window.location.reload();
  }, [stale]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-on-surface">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {stale ? "A new version of JINNY MOD GO is live. Reload to open Projects." : message}
      </p>
      <button
        type="button"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary"
        onClick={() => {
          try {
            sessionStorage.removeItem("jmg-chunk-reload");
          } catch {
            /* ignore */
          }
          window.location.assign("/projects");
        }}
      >
        Reload
      </button>
    </main>
  );
}