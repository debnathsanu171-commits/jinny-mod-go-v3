import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg bg-paper p-4 shadow-card transition-all duration-200 hover:shadow-md hover:-translate-y-0.5", className)} {...props} />;
}
