"use client";

import { toast as sonnerToast } from "sonner";

function toast({ title, description, variant = "default", duration = 4000 }) {
  if (variant === "destructive") {
    return sonnerToast.error(title, { description, duration });
  }
  if (title?.includes("❌")) {
    return sonnerToast.error(title, { description, duration });
  }
  return sonnerToast.success(title, { description, duration });
}

function dismiss(id) {
  sonnerToast.dismiss(id);
}

function useToast() {
  return { toast, dismiss };
}

export { useToast, toast };
