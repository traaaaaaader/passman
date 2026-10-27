import { Moon, Sun } from "lucide-react";
import type { Settings } from "../../lib/api";
import { useTheme } from "../../lib/theme";
import { Card, CardContent, CardHeader, CardTitle } from "../ui";

interface ThemeSettingsCardProps {
  settings: Settings;
  onUpdate: (next: Settings) => void;
}

export function ThemeSettingsCard({ settings, onUpdate }: ThemeSettingsCardProps) {
  const { theme, setTheme } = useTheme();

  const choose = (next: Settings["theme"]) => {
    setTheme(next);
    onUpdate({ ...settings, theme: next });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Тема оформления</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => choose("light")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
              theme === "light"
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <Sun size={16} />
            Светлая
          </button>
          <button
            onClick={() => choose("dark")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
              theme === "dark"
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <Moon size={16} />
            Тёмная
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
