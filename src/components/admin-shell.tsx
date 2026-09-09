import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck, Factory, Menu, X, Shield } from "lucide-react";
import { useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { APP_NAME_MARK } from "@/lib/platform";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", label: "Subscribers", icon: ShieldCheck },
  { to: "/admin/security", label: "Security", icon: Shield },
  { to: "/", label: "Factory workspace", icon: Factory },
];

export function AdminShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useCurrentUser();
  const { isPending } = useCurrentUserState();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-nav text-on-primary transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-white/10 px-6 py-6">
          <p className="text-lg font-bold tracking-tight">{APP_NAME_MARK}</p>
          <p className="mt-1 text-xs text-nav-muted">Owner subscription portal</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto py-3">
          {NAV.map((item) => {
            const active =
              item.to === "/admin"
                ? pathname === "/admin" || pathname === "/admin/"
                : item.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                  active
                    ? "border-l-4 border-info bg-primary text-on-primary"
                    : "border-l-4 border-transparent text-nav-muted hover:bg-white/5 hover:text-on-primary",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          {isPending ? (
            <div className="size-9 animate-pulse rounded-full bg-white/10" />
          ) : (
            <UserButton />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{user?.displayName ?? "Owner"}</p>
            <p className="truncate text-xs text-nav-muted">{user?.primaryEmail ?? ""}</p>
          </div>
        </div>
      </aside>
      {open ? (
        <button
          className="fixed inset-0 z-30 bg-primary/40 md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="flex min-h-screen flex-1 flex-col md:ml-60">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-outline bg-surface px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-2 hover:bg-surface-low md:hidden" onClick={() => setOpen(true)}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <h1 className="text-lg font-semibold">{title ?? "Owner portal"}</h1>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
