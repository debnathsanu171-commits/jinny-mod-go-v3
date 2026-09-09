import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium select-none transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:translate-y-[2px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-on-primary shadow-[0_4px_0_#0a0f1a,0_6px_12px_rgba(15,23,42,0.18)] hover:-translate-y-[1px] hover:shadow-[0_5px_0_#0a0f1a,0_8px_16px_rgba(15,23,42,0.22)] active:shadow-[0_1px_0_#0a0f1a,0_2px_4px_rgba(15,23,42,0.12)]",
        outline:
          "border border-outline bg-paper text-foreground shadow-[0_3px_0_#cbd5e1,0_4px_8px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:bg-surface-low hover:shadow-[0_4px_0_#cbd5e1,0_6px_12px_rgba(15,23,42,0.08)] active:shadow-[0_1px_0_#cbd5e1,0_1px_2px_rgba(15,23,42,0.04)]",
        ghost:
          "text-foreground hover:bg-surface-container hover:-translate-y-[1px] active:translate-y-0",
        danger:
          "bg-danger text-on-primary shadow-[0_4px_0_#b91c1c,0_6px_12px_rgba(239,68,68,0.2)] hover:-translate-y-[1px] hover:shadow-[0_5px_0_#b91c1c,0_8px_16px_rgba(239,68,68,0.25)] active:shadow-[0_1px_0_#b91c1c,0_2px_4px_rgba(239,68,68,0.1)]",
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-5 text-sm",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button type="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}