import * as React from 'react';
import {cn} from '@/lib/utils';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: 'default' | 'outline'};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({className, variant = 'default', ...props}, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50',
        variant === 'outline'
          ? 'border border-slate-700 bg-transparent text-slate-100 hover:bg-slate-800'
          : 'bg-indigo-600 text-white hover:bg-indigo-500',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
