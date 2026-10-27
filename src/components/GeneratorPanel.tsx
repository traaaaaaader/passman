import { RefreshCw } from "lucide-react";
import type { GeneratorDefaults } from "../lib/api";
import { MAX_LENGTH, MIN_LENGTH, generatePassword } from "../lib/generator";
import { LabeledSwitch } from "./ui";

interface GeneratorPanelProps {
  options: GeneratorDefaults;
  onOptionsChange: (options: GeneratorDefaults) => void;
  onGenerate: (password: string) => void;
}

export function GeneratorPanel({
  options,
  onOptionsChange,
  onGenerate,
}: GeneratorPanelProps) {
  const noCharsetSelected =
    !options.uppercase && !options.lowercase && !options.digits && !options.symbols;

  const regenerate = (next: GeneratorDefaults) => {
    onOptionsChange(next);
    const hasAny = next.uppercase || next.lowercase || next.digits || next.symbols;
    if (hasAny) onGenerate(generatePassword(next));
  };

  return (
    <div className="border-border bg-muted rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-foreground text-sm font-medium">Генератор пароля</span>
        <button
          type="button"
          onClick={() => regenerate(options)}
          className="text-primary hover:bg-accent inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
        >
          <RefreshCw size={14} />
          Сгенерировать
        </button>
      </div>

      <div className="mt-3">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>Длина</span>
          <span className="text-foreground font-mono">{options.length}</span>
        </div>
        <input
          type="range"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          value={options.length}
          onChange={(e) => regenerate({ ...options, length: Number(e.target.value) })}
          className="accent-primary mt-1 w-full"
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4">
        <LabeledSwitch
          label="A-Z"
          checked={options.uppercase}
          onChange={(v) => regenerate({ ...options, uppercase: v })}
        />
        <LabeledSwitch
          label="a-z"
          checked={options.lowercase}
          onChange={(v) => regenerate({ ...options, lowercase: v })}
        />
        <LabeledSwitch
          label="0-9"
          checked={options.digits}
          onChange={(v) => regenerate({ ...options, digits: v })}
        />
        <LabeledSwitch
          label="!@#$"
          checked={options.symbols}
          onChange={(v) => regenerate({ ...options, symbols: v })}
        />
      </div>

      {noCharsetSelected && (
        <p className="text-destructive mt-2 text-xs">
          Выберите хотя бы один набор символов
        </p>
      )}
    </div>
  );
}
