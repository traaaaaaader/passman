import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "./input";
import { Label } from "./label";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  inputClassName?: string;
}

export function TextField({
  label,
  error,
  hint,
  trailing,
  id,
  className = "",
  inputClassName = "",
  ...rest
}: TextFieldProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      <Label htmlFor={inputId} className="mb-1.5">
        {label}
      </Label>
      <div className="relative flex items-center">
        <Input
          id={inputId}
          aria-invalid={Boolean(error)}
          className={`h-9 ${trailing ? "pr-16" : ""} ${inputClassName}`}
          {...rest}
        />
        {trailing && (
          <div className="absolute right-2 flex items-center gap-1">{trailing}</div>
        )}
      </div>
      {hint && !error && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}
