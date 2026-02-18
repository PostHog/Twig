import { Text } from "../../components/text";

interface LogEntry {
  message: string;
  attributes?: Record<string, string | number>;
}

interface LogsProps {
  logs?: LogEntry[];
  className?: string;
}

export function Logs({ logs = [], className = "" }: LogsProps) {
  const defaultLogs: LogEntry[] = [
    {
      message: "User authentication successful",
      attributes: { userId: "usr_123", method: "oauth", duration: "145ms" },
    },
    {
      message: "Database query executed",
      attributes: { table: "users", rows: 1, time: "23ms" },
    },
    {
      message: "API request received",
      attributes: { endpoint: "/api/data", status: 200 },
    },
  ];

  const displayLogs = logs.length > 0 ? logs : defaultLogs;

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Logs
        </Text>
      </div>

      <div className="divide-y divide-border">
        {displayLogs.map((log) => (
          <div key={log.message} className="px-3 py-2">
            {log.attributes && (
              <div className="mb-1 flex flex-wrap gap-x-2 gap-y-1">
                {Object.entries(log.attributes).map(([key, value]) => (
                  <Text
                    key={key}
                    size="caption"
                    className="text-fg/60"
                    as="span"
                  >
                    {key}: {value}
                  </Text>
                ))}
              </div>
            )}
            <Text size="body-sm" className="text-fg/90">
              {log.message}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}
