import * as React from 'react';
import {cn} from '@/lib/utils';
export const Card=({className,...props}:React.HTMLAttributes<HTMLDivElement>)=>(<div className={cn('rounded-xl border border-slate-800 bg-slate-900 p-5 shadow',className)} {...props}/>);
export const CardTitle=({className,...props}:React.HTMLAttributes<HTMLHeadingElement>)=>(<h2 className={cn('text-lg font-semibold',className)} {...props}/>);
