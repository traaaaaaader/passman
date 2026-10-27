import type { Settings } from "../../lib/api";
import { GeneratorPanel } from "../GeneratorPanel";
import { Card, CardContent, CardHeader, CardTitle } from "../ui";

interface GeneratorSettingsCardProps {
  settings: Settings;
  onUpdate: (next: Settings) => void;
}

export function GeneratorSettingsCard({
  settings,
  onUpdate,
}: GeneratorSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Генератор паролей по умолчанию</CardTitle>
      </CardHeader>
      <CardContent>
        <GeneratorPanel
          options={settings.generator}
          onOptionsChange={(generator) => onUpdate({ ...settings, generator })}
          onGenerate={() => {}}
        />
      </CardContent>
    </Card>
  );
}
