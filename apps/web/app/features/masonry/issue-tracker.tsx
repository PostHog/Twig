import { Text } from "../../components/text";

interface Issue {
  title: string;
  status: "open" | "in_progress" | "closed";
  priority: "high" | "medium" | "low";
  assignee: string;
}

interface IssueTrackerProps {
  issues?: Issue[];
  className?: string;
}

export function IssueTracker({
  issues = [],
  className = "",
}: IssueTrackerProps) {
  const defaultIssues: Issue[] = [
    {
      title: "Login button not responsive on mobile",
      status: "in_progress",
      priority: "high",
      assignee: "Sarah",
    },
    {
      title: "Add export functionality to reports",
      status: "open",
      priority: "medium",
      assignee: "Mike",
    },
    {
      title: "Fix password reset email template",
      status: "closed",
      priority: "high",
      assignee: "Alex",
    },
    {
      title: "Update documentation for API v2",
      status: "open",
      priority: "low",
      assignee: "Jordan",
    },
  ];

  const displayIssues = issues.length > 0 ? issues : defaultIssues;

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Issue Tracker
        </Text>
      </div>

      <div className="divide-y divide-border">
        {displayIssues.map((issue) => (
          <div key={issue.title} className="px-3 py-2">
            <Text size="body-sm" className="mb-1 text-fg/90">
              {issue.title}
            </Text>
            <div className="flex items-center gap-2">
              <Text size="caption" className="text-fg/60">
                {issue.status}
              </Text>
              <Text size="caption" className="text-fg/60">
                •
              </Text>
              <Text size="caption" className="text-fg/60">
                {issue.priority}
              </Text>
              <Text size="caption" className="text-fg/60">
                •
              </Text>
              <Text size="caption" className="text-fg/60">
                {issue.assignee}
              </Text>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
