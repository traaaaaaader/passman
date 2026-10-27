import type { Settings } from "../../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../ui";

interface ClipboardSettingsCardProps {
  settings: Settings;
  onUpdate: (next: Settings) => void;
}

export function ClipboardSettingsCard({
  settings,
  onUpdate,
}: ClipboardSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Буфер обмена</CardTitle>
        <CardDescription>
          Через сколько секунд после копирования пароль будет удалён из буфера обмена
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          type="number"
          min={5}
          max={120}
          value={settings.clipboardClearSeconds}
          onChange={(e) =>
            onUpdate({ ...settings, clipboardClearSeconds: Number(e.target.value) })
          }
          className="h-9 w-28"
        />
      </CardContent>
    </Card>
  );
}
