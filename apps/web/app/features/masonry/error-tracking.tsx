import { Text } from "../../components/text";

interface ErrorEntry {
  message: string;
  count: number;
  timestamp: string;
}

interface ErrorTrackingProps {
  errors?: ErrorEntry[];
  className?: string;
}

export function ErrorTracking({
  errors = [],
  className = "",
}: ErrorTrackingProps) {
  const defaultErrors: ErrorEntry[] = [
    {
      message: "TypeError: Cannot read property 'map' of undefined",
      count: 142,
      timestamp: "2m ago",
    },
    {
      message: "ReferenceError: user is not defined",
      count: 89,
      timestamp: "5m ago",
    },
    {
      message: "NetworkError: Failed to fetch",
      count: 67,
      timestamp: "12m ago",
    },
    {
      message: "ValidationError: Email format invalid",
      count: 34,
      timestamp: "18m ago",
    },
  ];

  const displayErrors = errors.length > 0 ? errors : defaultErrors;

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Error Tracking
        </Text>
      </div>

      <div className="divide-y divide-border">
        {displayErrors.map((error) => (
          <div key={error.message} className="px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <Text size="caption" className="text-fg/60">
                {error.timestamp}
              </Text>
              <Text size="caption" className="text-fg/60">
                {error.count}x
              </Text>
            </div>
            <Text size="body-sm" className="text-fg/90">
              {error.message}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}
