"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Sheet = ({ open, onOpenChange, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  );
};

const SheetContent = React.forwardRef(({ className, side = "left", children, onClose, ...props }, ref) => (
  <div ref={ref}
    className={cn(
      "fixed z-50 bg-white shadow-2xl transition-all duration-300 animate-in",
      side === "left" && "inset-y-0 left-0 w-[320px] border-r slide-in-from-left",
      side === "right" && "inset-y-0 right-0 w-[320px] border-l slide-in-from-right",
      className
    )}
    {...props}>
    <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full p-1 hover:bg-zinc-100 transition-colors">
      <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
    {children}
  </div>
));
SheetContent.displayName = "SheetContent";

export { Sheet, SheetContent };
