import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-outline bg-paper px-3 font-mono text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary",
        className,
      )}
      {...props}
    />
  );
}
