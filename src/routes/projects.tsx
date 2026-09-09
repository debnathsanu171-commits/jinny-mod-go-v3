import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects")({ component: Layout });

function Layout() {
  return <Outlet />;
}
