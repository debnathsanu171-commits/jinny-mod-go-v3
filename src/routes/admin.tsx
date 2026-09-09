import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Guard } from "@/components/guard";

export const Route = createFileRoute("/admin")({ component: Layout });

function Layout() {
  return (
    <Guard title="Owner portal" kind="admin">
      <Outlet />
    </Guard>
  );
}
