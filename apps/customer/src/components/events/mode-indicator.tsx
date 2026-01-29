import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MODE_CONFIG = {
  pre: { label: "Pre-Event", colors: "bg-yellow-500 text-white border-yellow-600 hover:bg-yellow-600" },
  live: { label: "Live", colors: "bg-green-500 text-white border-green-600 hover:bg-green-600" },
  post: { label: "Post-Event", colors: "bg-gray-500 text-white border-gray-600 hover:bg-gray-600" },
} as const;

export function ModeIndicator({ mode, className }: { mode: "pre" | "live" | "post"; className?: string }) {
  const config = MODE_CONFIG[mode];
  return <Badge className={cn(config.colors, className)}>{config.label}</Badge>;
}
