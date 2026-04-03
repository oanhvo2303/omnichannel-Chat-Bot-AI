import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    (<div
      className={cn("animate-pulse rounded-md bg-zinc-200/60 dark:bg-zinc-800/60", className)}
      {...props} />)
  );
}

export { Skeleton }
