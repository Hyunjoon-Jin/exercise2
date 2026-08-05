import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  hint?: string;
}

export function AuthFormField({ label, name, hint, ...inputProps }: Props) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-describedby={hintId}
        className="w-full rounded-lg border border-border-strong bg-background px-3 py-2.5 text-base
                   transition-colors placeholder:text-muted focus:border-brand-500"
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
