import { Label } from "./label";
import { Switch } from "./switch";

interface LabeledSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function LabeledSwitch({
  checked,
  onChange,
  label,
  disabled,
}: LabeledSwitchProps) {
  return (
    <Label className="flex items-center justify-between gap-3 py-1 font-normal">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Label>
  );
}
