import { createFileRoute } from "@tanstack/react-router";
import { VaultView } from "../../components/VaultView";
import { useSections } from "../../lib/sections";

interface VaultSearch {
  section?: string;
}

export const Route = createFileRoute("/_app/vault")({
  validateSearch: (search: Record<string, unknown>): VaultSearch => ({
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  component: VaultRoute,
});

function VaultRoute() {
  const { section } = Route.useSearch();
  const { sections } = useSections();
  return <VaultView sections={sections} sectionId={section} />;
}
