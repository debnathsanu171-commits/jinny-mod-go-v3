import { AsyncLocalStorage } from "node:async_hooks";

export type RlsContext = {
  rls: boolean;
  isOwner: boolean;
  workspaceId: string;
  loginUserId: string;
  loginEmail: string;
};

const als = new AsyncLocalStorage<RlsContext>();

const EMPTY: RlsContext = {
  rls: false,
  isOwner: false,
  workspaceId: "",
  loginUserId: "",
  loginEmail: "",
};

export function getRls(): RlsContext | undefined {
  return als.getStore();
}

/** Bind RLS for the rest of this request (callers after this see the GUC). */
export function bindRls(partial: Partial<RlsContext>): RlsContext {
  const next: RlsContext = { ...(als.getStore() ?? EMPTY), ...partial, rls: true };
  als.enterWith(next);
  return next;
}

export const RLS_GUC_SQL = `
  select
    set_config('app.rls', $1, true),
    set_config('app.workspace_id', $2, true),
    set_config('app.is_owner', $3, true),
    set_config('app.login_user_id', $4, true),
    set_config('app.login_email', $5, true)
`;

export function rlsGucParams(ctx: RlsContext): string[] {
  return [
    ctx.rls ? "on" : "off",
    ctx.workspaceId || "",
    ctx.isOwner ? "1" : "0",
    ctx.loginUserId || "",
    (ctx.loginEmail || "").toLowerCase(),
  ];
}
