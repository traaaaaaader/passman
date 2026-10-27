import { useSettings } from "../../lib/settings";
import { ChangeMasterPasswordCard } from "./ChangeMasterPasswordCard";
import { ClipboardSettingsCard } from "./ClipboardSettingsCard";
import { GeneratorSettingsCard } from "./GeneratorSettingsCard";
import { ThemeSettingsCard } from "./ThemeSettingsCard";

export function SettingsView() {
  const { settings, update } = useSettings();

  if (!settings) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-foreground text-xl font-semibold">Настройки</h1>

      <ThemeSettingsCard
        settings={settings}
        onUpdate={(next) => void update(next).catch(console.error)}
      />
      <GeneratorSettingsCard
        settings={settings}
        onUpdate={(next) => void update(next).catch(console.error)}
      />
      <ClipboardSettingsCard
        settings={settings}
        onUpdate={(next) => void update(next).catch(console.error)}
      />
      <ChangeMasterPasswordCard />
    </div>
  );
}
