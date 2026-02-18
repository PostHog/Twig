import { Text } from "../../components/text";

interface Recording {
  user: string;
  duration: string;
  timestamp: string;
  pageViews: number;
}

interface SessionRecordingsProps {
  recordings?: Recording[];
  className?: string;
}

export function SessionRecordings({
  recordings = [],
  className = "",
}: SessionRecordingsProps) {
  const defaultRecordings: Recording[] = [
    {
      user: "sarah_chen@company.com",
      duration: "4:32",
      timestamp: "2m ago",
      pageViews: 12,
    },
    {
      user: "mike_wilson@startup.io",
      duration: "2:18",
      timestamp: "8m ago",
      pageViews: 7,
    },
    {
      user: "alex_rodriguez@tech.co",
      duration: "6:45",
      timestamp: "15m ago",
      pageViews: 18,
    },
  ];

  const displayRecordings =
    recordings.length > 0 ? recordings : defaultRecordings;

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Session Recordings
        </Text>
      </div>

      <div className="divide-y divide-border">
        {displayRecordings.map((recording) => (
          <div key={recording.user} className="px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <Text size="body-sm" className="text-fg/90">
                {recording.user}
              </Text>
              <Text size="caption" className="text-fg/60">
                {recording.timestamp}
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Text size="caption" className="text-fg/60">
                {recording.duration}
              </Text>
              <Text size="caption" className="text-fg/60">
                •
              </Text>
              <Text size="caption" className="text-fg/60">
                {recording.pageViews} pages
              </Text>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
