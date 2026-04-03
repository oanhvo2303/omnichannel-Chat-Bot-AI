import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare } from "lucide-react";

export default function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full bg-zinc-50/50">
      {/* Header Skeleton */}
      <div className="px-6 py-4 bg-white border-b border-zinc-200/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </div>

      {/* Messages Skeleton */}
      <div className="flex-1 p-6 space-y-6 overflow-hidden">
        {/* Date bubble */}
        <div className="flex justify-center mb-6">
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        
        <div className="flex items-end gap-2 max-w-[85%]">
          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-[250px] rounded-2xl rounded-bl-sm" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>

        <div className="flex items-end justify-end gap-2 max-w-[85%] ml-auto">
          <div className="space-y-2 flex flex-col items-end">
            <Skeleton className="h-16 w-[200px] rounded-2xl rounded-br-sm" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>

        <div className="flex items-end gap-2 max-w-[85%]">
          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="space-y-2">
             <Skeleton className="h-12 w-[300px] rounded-2xl rounded-bl-sm" />
             <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>

      {/* Input Skeleton */}
      <div className="p-4 bg-white border-t border-zinc-200/80">
        <div className="flex gap-2">
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-12 w-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
