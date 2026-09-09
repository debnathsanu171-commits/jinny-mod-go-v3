import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Factory } from "lucide-react";
import { APP_NAME_MARK, isPlatformAdminEmail } from "@/lib/platform";
import { ensurePlatformSeed } from "@/lib/server";
import { checkLoginAllowed, recordLoginFail, recordLoginOk } from "@/lib/security";

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>): { switch?: boolean } => {
    if (raw.switch === "1" || raw.switch === true) return { switch: true };
    return {};
  },
  component: Login,
});

function Login() {
  const { switch: allowSwitch } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void ensurePlatformSeed().catch(() => {});
  }, []);

  if (isPending) {
    return (
      <main className="flex min-h-screen bg-background">
        <div className="relative hidden overflow-hidden lg:block lg:w-[46%]">
          <img src="/login-hero.jpg" alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-primary/85 to-primary/15" />
        </div>
        <div className="flex w-full items-center justify-center p-8 lg:w-[54%]">
          <div className="w-full max-w-sm space-y-4">
            <div className="h-8 w-40 animate-pulse rounded bg-surface-container" />
            <div className="h-11 animate-pulse rounded-md bg-surface-container" />
            <div className="h-11 animate-pulse rounded-md bg-surface-container" />
          </div>
        </div>
      </main>
    );
  }
  if (user && isPlatformAdminEmail(user.primaryEmail)) {
    return <Navigate to="/admin" />;
  }
  if (user && !allowSwitch) {
    return <Navigate to="/" />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const gate = await checkLoginAllowed({ data: { email } });
      if (!gate.ok) throw new Error(gate.message);
      const { error: err } = await authClient.signIn.email({ email, password });
      if (err) {
        const rec = await recordLoginFail({ data: { email } });
        throw new Error(!rec.ok && "message" in rec ? rec.message : (err.message ?? "Sign-in failed"));
      }
      await authClient.getSession();
      await recordLoginOk().catch(() => {});
      window.location.assign(isPlatformAdminEmail(email) ? "/admin" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-background">
      <div className="relative hidden overflow-hidden lg:block lg:w-[46%]">
        <img src="/login-hero.jpg" alt="Factory packing floor" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-primary/90 via-primary/40 to-primary/10" />
        <div className="absolute bottom-12 left-12 right-12 z-10 text-on-primary">
          <div className="mb-4 flex items-center gap-3">
            <Factory className="size-8" />
            <span className="text-xl font-bold tracking-tight">{APP_NAME_MARK}</span>
          </div>
          <h1 className="max-w-md text-3xl font-semibold tracking-tight">Owner-issued factory login</h1>
          <p className="mt-2 max-w-sm text-sm text-on-primary/80">
            No public signup. Only the ID and password created in the owner portal can open a factory.
          </p>
        </div>
      </div>
      <div className="flex w-full items-center justify-center p-6 lg:w-[54%]">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Factory className="size-8 text-primary" />
            <h1 className="mt-2 text-xl font-semibold">{APP_NAME_MARK}</h1>
            <p className="text-sm text-muted">Owner-issued factory login</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use the login ID given by JINNY MOD GO. Self-register is closed.</p>
          {user ? (
            <p className="mt-2 text-sm text-warn">Signed in as {user.primaryEmail}. Enter another issued login to switch.</p>
          ) : null}
          {authEnabled ? (
            <form onSubmit={onSubmit} className="mt-6 grid gap-3">
              <div>
                <Label htmlFor="email" className="mb-0.5 text-xs text-muted">
                  Login ID / email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="factory@client.com"
                />
              </div>
              <div>
                <Label htmlFor="password" className="mb-0.5 text-xs text-muted">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="mt-1 h-11 w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : (
            <p className="mt-6 text-sm text-muted">Sign-in is disabled.</p>
          )}
          <p className="mt-6 border-t border-outline pt-4 text-xs leading-relaxed text-muted">
            Each factory is isolated. A client team stays under that client. If the owner suspends the client, the whole team is locked and sees the owner’s message.
          </p>
        </div>
      </div>
    </main>
  );
}
