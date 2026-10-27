import { estimateStrength, type StrengthLevel } from "../lib/generator";

const levelColor: Record<StrengthLevel, string> = {
  weak: "bg-destructive",
  fair: "bg-amber-500",
  strong: "bg-primary/70",
  "very-strong": "bg-primary",
};

const SEGMENT_KEYS = ["seg-1", "seg-2", "seg-3", "seg-4"];

export function StrengthMeter({ password }: { password: string }) {
  const strength = estimateStrength(password);
  const active = Math.max(
    password ? 1 : 0,
    Math.round((strength.score / 100) * SEGMENT_KEYS.length),
  );

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {SEGMENT_KEYS.map((key, i) => (
          <div
            key={key}
            className={`h-1.5 flex-1 rounded-full ${
              i < active ? levelColor[strength.level] : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{strength.label}</p>
    </div>
  );
}
