import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge classes with tailwind-merge with clsx full feature */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A component's own classes, plus the caller's when there are any: merged
 * (tailwind-merge) only then, so a component drawn many times per frame
 * without overrides costs nothing to style.
 */
export function withClassName(base: string, className?: string) {
  return className ? twMerge(base, className) : base;
}
