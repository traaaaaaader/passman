import { createFileRoute, Navigate } from "@tanstack/react-router";
import { UnlockScreen } from "../components/UnlockScreen";
import { useSession } from "../lib/session";

export const Route = createFileRoute("/unlock")({
  component: UnlockRoute,
});

function UnlockRoute() {
  const { status, loading } = useSession();
  if (loading || !status) return null;
  if (status.unlocked) return <Navigate to="/vault" />;
  return <UnlockScreen />;
}
