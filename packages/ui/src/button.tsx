import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
const buttonVariants = cva('inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border border-border bg-background text-foreground hover:bg-muted', destructive: 'bg-destructive text-white hover:opacity-90', ghost: 'hover:bg-muted text-foreground' } },
  defaultVariants: { variant: 'default' },
});
export function Button({ className, variant, asChild = false, type = 'button', ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, className }))} type={type} {...props} />;
}
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn('min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', className)} {...props} />;
}
