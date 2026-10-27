import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSession } from "../lib/session";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  const { status, loading } = useSession();
  if (loading || !status) return null;
  if (!status.unlocked) return <Navigate to="/unlock" />;
  return <Navigate to="/vault" />;
}
