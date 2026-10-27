import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "../../components/SettingsView";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsView,
});
