import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKg(n: number, digits = 2) {
  return `${n.toFixed(digits)} kg`;
}

export function formatMt(kg: number) {
  return `${(kg / 1000).toFixed(5)} MT`;
}
