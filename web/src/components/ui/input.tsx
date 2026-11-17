import * as React from 'react';
import {cn} from '@/lib/utils';
export const Input=React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({className,...props},ref)=>(<input ref={ref} className={cn('w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500',className)} {...props}/>));
Input.displayName='Input';
