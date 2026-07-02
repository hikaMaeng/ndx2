import * as React from "react";
import { cn } from "./utils";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn("h-4 w-4 rounded border-zinc-700 bg-zinc-950 accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props}
  />
));

Checkbox.displayName = "Checkbox";
