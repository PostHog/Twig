import { Text } from "../../components/text";

interface DailyActiveUsersProps {
  className?: string;
}

export function DailyActiveUsers({ className = "" }: DailyActiveUsersProps) {
  const data = [45, 52, 48, 65, 58, 72, 68, 75, 82, 88, 95, 92, 98];
  const max = Math.max(...data);

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Daily Active Users
        </Text>
      </div>

      <div className="px-3 py-4">
        <div className="mb-2">
          <Text size="heading-6" className="font-medium">
            98
          </Text>
          <Text size="caption" className="text-fg/60">
            users today
          </Text>
        </div>

        <div className="flex h-24 items-end gap-1">
          {data.map((value) => (
            <div
              key={value}
              className="flex-1 bg-fg/20"
              style={{
                height: `${(value / max) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
