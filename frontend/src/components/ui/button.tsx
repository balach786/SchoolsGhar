import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all active:scale-[.985] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white shadow-[0_10px_22px_-5px_rgba(37,99,235,0.4)] hover:shadow-[0_22px_45px_-12px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:scale-[1.02] border border-white/10 transition-all duration-300',
        destructive: 'bg-gradient-to-br from-[#F43F5E] to-[#BE123C] text-white shadow-[0_10px_22px_-5px_rgba(244,63,94,0.4)] hover:shadow-[0_22px_45px_-12px_rgba(244,63,94,0.3)] hover:-translate-y-0.5 hover:scale-[1.02] border border-white/10 transition-all duration-300',
        outline: 'border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] text-[#1D4ED8] shadow-sm hover:border-[#60A5FA] hover:shadow-[0_10px_22px_-5px_rgba(37,99,235,0.2)] hover:-translate-y-0.5 transition-all duration-300',
        secondary: 'bg-gradient-to-br from-[#F8F5FF] to-[#EDE9FE] text-[#6D28D9] border border-[#DDD6FE] shadow-sm hover:border-[#A78BFA] hover:shadow-[0_10px_22px_-5px_rgba(124,58,237,0.2)] hover:-translate-y-0.5 transition-all duration-300',
        ghost: 'hover:bg-[#E0EDFF] hover:text-[#1D4ED8] transition-colors duration-300',
        link: 'text-[#3B82F6] underline-offset-4 hover:underline transition-colors duration-300',
        success: 'bg-gradient-to-br from-[#10B981] to-[#047857] text-white shadow-[0_10px_22px_-5px_rgba(16,185,129,0.4)] hover:shadow-[0_22px_45px_-12px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 hover:scale-[1.02] border border-white/10 transition-all duration-300',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-full px-8',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
