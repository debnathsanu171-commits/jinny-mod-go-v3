import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppShell } from "@/components/app-shell";
import { AdminShell } from "@/components/admin-shell";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAccess } from "@/lib/server";
import { factoryBlockMessage, departmentLabel, hasPerm, type Access, type Permission } from "@/lib/platform";
import { ShieldOff, Lock } from "lucide-react";

const LOAD_MS = 10_000;

function Shell({
  kind,
  title,
  children,
}: {
  kind: "factory" | "admin";
  title?: string;
  children: ReactNode;
}) {
  if (kind === "admin") return <AdminShell title={title}>{children}</AdminShell>;
  return <AppShell title={title}>{children}</AppShell>;
}

function AccessGate({ access }: { access: Access | undefined }) {
  const status = access?.status ?? "none";
  const message = factoryBlockMessage(status, access?.role, access?.portal_message, access?.ends_at);
  const title =
    access && status === "active" && access.ends_at && Date.parse(access.ends_at) <= Date.now()
      ? "Subscription ended"
      : status === "suspended"
        ? "Factory suspended"
        : status === "revoked"
          ? "Access revoked"
          : status === "none"
            ? "Login not issued"
            : "Access locked";
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-primary/40" />
      <Card className="relative z-10 w-full max-w-md space-y-4 p-6 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-container">
            <ShieldOff className="size-5 text-muted" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight">{title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {access?.company ? access.company : "JINNY MOD GO"}
              {access?.role === "worker" && access.department ? ` · ${departmentLabel(access.department)}` : ""}
            </p>
          </div>
        </div>
        <Badge tone={statusTone(status)}>{status}</Badge>
        <p className="text-sm leading-relaxed text-foreground">{message}</p>
        <p className="text-xs text-muted">
          {access?.email
            ? `Signed in as ${access.email}. Client and team stay locked together until the owner restores this factory.`
            : "Sign in with the ID the owner created in the portal."}
        </p>
        <div className="flex flex-wrap items-center gap-3 border-t border-outline pt-4">
          <UserButton />
          <Link
            to="/login"
            search={{ switch: true }}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Use a different account
          </Link>
        </div>
      </Card>
    </main>
  );
}

function OwnerNotice({ access, children }: { access: Access; children: ReactNode }) {
  const key = `mp-notice-${access.subscriberId ?? "x"}`;
  const [open, setOpen] = useState(() => {
    const msg = (access.portal_message ?? "").trim();
    if (!msg) return false;
    try {
      return sessionStorage.getItem(key) !== msg;
    } catch {
      return true;
    }
  });
  const msg = (access.portal_message ?? "").trim();
  if (!open || !msg) return <>{children}</>;
  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4">
        <Card className="w-full max-w-md space-y-4 p-6">
          <div>
            <p className="text-base font-semibold">Message from JINNY MOD GO</p>
            {access.company ? <p className="mt-0.5 text-xs text-muted">{access.company}</p> : null}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg}</p>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                try {
                  sessionStorage.setItem(key, msg);
                } catch {
                  /* ignore */
                }
                setOpen(false);
              }}
            >
              OK
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function LoadFailed({
  kind,
  title,
  message,
  onRetry,
  showSwitch,
}: {
  kind: "factory" | "admin";
  title?: string;
  message: string;
  onRetry: () => void;
  showSwitch?: boolean;
}) {
  return (
    <Shell kind={kind} title={title}>
      <Card className="max-w-md space-y-3">
        <p className="text-sm font-semibold">Command Center did not load</p>
        <p className="text-sm text-muted">{message}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
          {showSwitch ? (
            <Link
              to="/login"
              search={{ switch: true }}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Use a different account
            </Link>
          ) : null}
        </div>
      </Card>
    </Shell>
  );
}

function Forbidden({ perm, access }: { perm: Permission; access: Access }) {
  return (
    <Card className="mx-auto max-w-md space-y-3">
      <div className="flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-md bg-surface-container">
          <Lock className="size-5 text-muted" />
        </div>
        <div>
          <p className="text-sm font-semibold">Not allowed for this role</p>
          <p className="mt-0.5 text-xs text-muted">
            {access.role === "worker" && access.department
              ? departmentLabel(access.department)
              : access.role === "subscriber"
                ? "Factory admin"
                : access.role}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted">
        Your login cannot open <span className="font-medium text-foreground">{perm}</span>. Ask the factory admin to change your department, or use a page in your menu.
      </p>
    </Card>
  );
}

export function Guard({
  children,
  title,
  kind = "factory",
  perm,
}: {
  children: ReactNode;
  title?: string;
  kind?: "factory" | "admin";
  perm?: Permission;
}) {
  const { sessionUser } = useRouteContext({ from: "__root__" });
  const { user, isPending } = useCurrentUserState();
  const [giveUp, setGiveUp] = useState(false);
  const hasIdentity = Boolean(user || sessionUser);
  const accessQ = useQuery({
    queryKey: ["access"],
    queryFn: () => getAccess(),
    enabled: hasIdentity,
    retry: false,
    refetchInterval: (q) => {
      const a = q.state.data;
      if (!a || a.canAdmin || a.canFactory) return false;
      return 10_000;
    },
  });

  useEffect(() => {
    const id = window.setTimeout(() => setGiveUp(true), LOAD_MS);
    return () => window.clearTimeout(id);
  }, []);

  const waitingSession = isPending && !hasIdentity && !giveUp;
  const waitingAccess = hasIdentity && accessQ.isPending && !giveUp;

  if (waitingSession || waitingAccess) {
    return (
      <Shell kind={kind} title={title}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-container" />
          ))}
        </div>
      </Shell>
    );
  }

  if (giveUp && !accessQ.data && (isPending || accessQ.isPending || accessQ.isError || !hasIdentity)) {
    const message =
      accessQ.error instanceof Error
        ? accessQ.error.message
        : hasIdentity
          ? "Factory access check stalled. Retry to load Command Center."
          : "Session did not finish loading. Retry, or sign in with a factory account.";
    return (
      <LoadFailed
        kind={kind}
        title={title}
        message={message}
        showSwitch={!hasIdentity}
        onRetry={() => {
          setGiveUp(false);
          void accessQ.refetch();
          window.location.reload();
        }}
      />
    );
  }

  if (!user && !sessionUser) return <RedirectToSignIn />;
  if (accessQ.error) {
    const msg = accessQ.error instanceof Error ? accessQ.error.message : "Could not verify access";
    if (msg === "Unauthorized") return <RedirectToSignIn />;
    return (
      <LoadFailed
        kind={kind}
        title={title}
        message={msg}
        onRetry={() => void accessQ.refetch()}
      />
    );
  }
  const access = accessQ.data;
  if (kind === "admin") {
    if (!access?.canAdmin) return <Navigate to="/" />;
    return <AdminShell title={title}>{children}</AdminShell>;
  }
  if (!access?.canFactory) return <AccessGate access={access} />;
  if (perm && !hasPerm(access, perm)) {
    return (
      <OwnerNotice access={access}>
        <AppShell title={title}>
          <Forbidden perm={perm} access={access} />
        </AppShell>
      </OwnerNotice>
    );
  }
  return (
    <OwnerNotice access={access}>
      <AppShell title={title}>{children}</AppShell>
    </OwnerNotice>
  );
}
