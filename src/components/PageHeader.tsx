import { Badge } from "@/components/ui/badge";

type Props = {
  title: string;
  description?: string;
  badge?: string;
};

export function PageHeader({ title, description, badge }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm mt-1">{description}</p>
        )}
      </div>
      {badge && (
        <Badge className="bg-teal text-teal-foreground text-sm px-3 py-1">
          {badge}
        </Badge>
      )}
    </div>
  );
}
