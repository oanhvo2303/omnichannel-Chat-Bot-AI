"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const ToastProvider = ToastPrimitive.Provider;

const ToastViewport = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport ref={ref}
    className={cn("fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:flex-col sm:top-auto sm:bottom-0 sm:right-0 md:max-w-[420px]", className)}
    {...props} />
));
ToastViewport.displayName = "ToastViewport";

const Toast = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <ToastPrimitive.Root ref={ref}
    className={cn(
      "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-xl border p-4 pr-8 shadow-xl transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-full",
      variant === "destructive" ? "border-red-200 bg-red-50 text-red-900" : "border-zinc-200 bg-white text-zinc-950",
      className
    )}
    {...props} />
));
Toast.displayName = "Toast";

const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Close ref={ref}
    className={cn("absolute right-2 top-2 rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-900 focus:opacity-100 focus:outline-none group-hover:opacity-100", className)}
    {...props}>
    <X className="h-4 w-4" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = "ToastClose";

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
));
ToastTitle.displayName = "ToastTitle";

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Description ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
));
ToastDescription.displayName = "ToastDescription";

export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose };
