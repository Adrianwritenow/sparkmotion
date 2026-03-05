const TAG_COLORS: Record<string, string> = {
  admin: "bg-blue-600",
  vip: "bg-purple-600",
};
const DEFAULT_TAG_COLOR = "bg-gray-600";

interface TagBadgeProps {
  tag: { title: string } | null | undefined;
}

export function TagBadge({ tag }: TagBadgeProps) {
  if (!tag) return null;
  const colorClass = TAG_COLORS[tag.title] ?? DEFAULT_TAG_COLOR;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${colorClass}`}
    >
      {tag.title}
    </span>
  );
}
