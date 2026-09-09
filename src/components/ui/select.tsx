import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-outline bg-paper px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
