import { Link, useRouterState, useRouteContext } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  Upload,
  Layers,
  Package,
  QrCode,
  Truck,
  Factory,
  MessageCircle,
  Settings,
  Search,
  HelpCircle,
  Menu,
  X,
  ScanLine,
  ShieldCheck,
  Users,
  Scissors,
  PanelLeftClose,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAccess } from "@/lib/server";
import { departmentLabel, hasPerm, isPlatformAdminEmail, APP_NAME_MARK, type Permission } from "@/lib/platform";
import { cn } from "@/lib/utils";

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; perm: Permission }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" },
  { to: "/projects", label: "Projects", icon: FolderKanban, perm: "projects" },
  { to: "/shop", label: "Floor SHOP", icon: Factory, perm: "projects" },
  { to: "/optimizer", label: "Optimizer", icon: Scissors, perm: "projects" },
  { to: "/uploads", label: "Uploads", icon: Upload, perm: "uploads" },
  { to: "/materials", label: "Materials", icon: Layers, perm: "materials" },
  { to: "/packing", label: "Packing", icon: Package, perm: "packing" },
  { to: "/labels", label: "Labels", icon: QrCode, perm: "labels" },
  { to: "/dispatch", label: "Dispatch", icon: Truck, perm: "dispatch" },
  { to: "/team", label: "Team", icon: Users, perm: "team" },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, perm: "whatsapp" },
  { to: "/settings", label: "Settings", icon: Settings, perm: "settings" },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { sessionUser } = useRouteContext({ from: "__root__" });
  const user = useCurrentUser();
  const { isPending } = useCurrentUserState();
  const [navOpen, setNavOpen] = useState(false);
  const email = user?.primaryEmail ?? sessionUser?.email ?? null;
  const showAdmin = isPlatformAdminEmail(email);
  const accessQ = useQuery({
    queryKey: ["access"],
    queryFn: () => getAccess(),
    enabled: Boolean(user || sessionUser),
    retry: false,
  });
  const access = accessQ.data;
  const nav = NAV.filter((item) => {
    if (showAdmin && item.to === "/team") return false;
    return hasPerm(access, item.perm);
  });
  const showFloor = hasPerm(access, "floor");
  const sessionReady = Boolean(user) || Boolean(sessionUser);
  const footerName = user?.displayName ?? (email ? email.split("@")[0] : "Operator");

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const close = () => setNavOpen(false);
    window.addEventListener("jmg-nav-close", close);
    return () => window.removeEventListener("jmg-nav-close", close);
  }, []);

  const showBomRail = /\/projects\/[^/]+\/subs\/[^/]+/.test(pathname);

  return (
    <div className="app-root">
      <aside
        className={cn("app-nav", navOpen && "is-open")}
        style={{ transform: navOpen ? "translateX(0)" : "translateX(-100%)" }}
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-5">
          <div>
            <p className="text-lg font-bold tracking-tight">{APP_NAME_MARK}</p>
            <p className="mt-1 text-xs text-nav-muted">
              {access?.company && access.role !== "owner" ? access.company : "Factory packing"}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-nav-muted hover:bg-white/10 hover:text-on-primary"
            aria-label="Close sidebar"
            onClick={() => setNavOpen(false)}
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto py-3">
          {showAdmin ? (
            <Link
              to="/admin"
              onClick={() => setNavOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-nav-muted hover:bg-white/5 hover:text-on-primary"
            >
              <ShieldCheck className="size-4" />
              Owner portal
            </Link>
          ) : null}
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setNavOpen(false)}
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
          {showFloor ? (
            <Link
              to="/floor"
              onClick={() => setNavOpen(false)}
              className="mt-4 flex items-center gap-3 px-4 py-3 text-sm text-nav-muted hover:bg-white/5 hover:text-on-primary"
            >
              <ScanLine className="size-4" />
              Floor scan
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          {isPending && !sessionReady ? (
            <div className="size-9 animate-pulse rounded-full bg-white/10" />
          ) : user ? (
            <UserButton />
          ) : (
            <span className="grid size-9 place-items-center rounded-full bg-white/10 text-sm font-medium">
              {(footerName.charAt(0) || "O").toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{footerName}</p>
            <p className="truncate text-xs text-nav-muted">
              {access?.role === "worker" && access.department
                ? departmentLabel(access.department)
                : access?.role === "subscriber"
                  ? "Factory admin"
                  : access?.role === "owner"
                    ? "Owner"
                    : (email ?? "")}
            </p>
          </div>
        </div>
      </aside>
      {navOpen ? (
        <button type="button" className="app-nav-backdrop no-print" aria-label="Close menu" onClick={() => setNavOpen(false)} />
      ) : null}
      <div className="app-body">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-outline bg-surface px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="shrink-0 rounded-md p-2 hover:bg-surface-low"
              aria-label={navOpen ? "Close sidebar" : "Open sidebar"}
              onClick={() => setNavOpen((v) => !v)}
            >
              {navOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <h1 className="truncate text-lg font-semibold">{title ?? "Packing & Dispatch"}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-muted">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <input
                className="h-9 w-56 rounded-md border border-outline bg-paper pl-9 pr-3 text-sm outline-none focus:border-primary"
                placeholder="Search projects..."
              />
            </div>
            <HelpCircle className="size-5" />
          </div>
        </header>
        <div className="app-content">
          <main className="app-main">{children}</main>
          {showBomRail ? <aside className="app-rail no-print" aria-label="Tools" /> : null}
        </div>
      </div>
    </div>
  );
}
