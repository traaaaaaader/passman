import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { GeneratorDefaults } from "../../lib/api";
import { generatePassword } from "../../lib/generator";
import { GeneratorPanel } from "../GeneratorPanel";
import { StrengthMeter } from "../StrengthMeter";
import { TextField } from "../ui";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  generatorOptions: GeneratorDefaults;
  onGeneratorOptionsChange: (options: GeneratorDefaults) => void;
  initiallyShowGenerator: boolean;
}

export function PasswordField({
  value,
  onChange,
  generatorOptions,
  onGeneratorOptionsChange,
  initiallyShowGenerator,
}: PasswordFieldProps) {
  const [showGenerator, setShowGenerator] = useState(initiallyShowGenerator);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <TextField
        label="Пароль"
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Сгенерируйте или введите свой"
        autoComplete="new-password"
        trailing={
          <>
            <button
              type="button"
              title="Сгенерировать пароль"
              onClick={() => onChange(generatePassword(generatorOptions))}
              className="text-muted-foreground hover:text-primary rounded p-1"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              title={showPassword ? "Скрыть" : "Показать"}
              onClick={() => setShowPassword((v) => !v)}
              className="text-muted-foreground hover:text-foreground rounded p-1"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </>
        }
      />
      <StrengthMeter password={value} />

      <button
        type="button"
        onClick={() => setShowGenerator((v) => !v)}
        className="text-primary mt-2 text-xs font-medium hover:underline"
      >
        {showGenerator ? "Скрыть настройки генератора" : "Настроить генератор"}
      </button>

      {showGenerator && (
        <div className="mt-2">
          <GeneratorPanel
            options={generatorOptions}
            onOptionsChange={onGeneratorOptionsChange}
            onGenerate={onChange}
          />
        </div>
      )}
    </div>
  );
}
