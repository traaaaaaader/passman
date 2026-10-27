import { createFileRoute, Navigate, Outlet, useSearch } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { SectionsProvider } from "../lib/sections";
import { useSession } from "../lib/session";
import { SettingsProvider } from "../lib/settings";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { status, loading } = useSession();
  if (loading || !status) return null;
  if (!status.unlocked) return <Navigate to="/unlock" />;

  return (
    <SettingsProvider>
      <SectionsProvider>
        <AppShellWithActiveSection />
      </SectionsProvider>
    </SettingsProvider>
  );
}

function AppShellWithActiveSection() {
  const search: { section?: string } = useSearch({ strict: false });
  return (
    <AppShell activeSectionId={search.section}>
      <Outlet />
    </AppShell>
  );
}
