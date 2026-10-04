import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-[#1E0566] text-white rounded-[10px] hover:bg-[#2A0A85] hover:shadow-[0_4px_12px_rgba(30,5,102,0.30)] active:scale-[0.98]",
        destructive:
          "bg-destructive text-white rounded-[10px] hover:bg-destructive/90 hover:shadow-[0_4px_12px_rgba(239,68,68,0.25)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-transparent rounded-[10px] shadow-xs hover:bg-accent hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] dark:bg-transparent dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-[#F3F4F6] text-[#111827] rounded-[10px] hover:bg-[#E5E7EB] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] active:scale-[0.98]",
        ghost:
          "rounded-[10px] hover:bg-accent dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-[10px]",
        "icon-sm": "size-8 rounded-[10px]",
        "icon-lg": "size-10 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
