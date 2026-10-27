import { createFileRoute } from "@tanstack/react-router";
import { SyncView } from "../../components/SyncView";

export const Route = createFileRoute("/_app/sync")({
  component: SyncView,
});
