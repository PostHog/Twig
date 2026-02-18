import { Text } from "../../components/text";

interface FeatureFlag {
  name: string;
  status: "active" | "inactive";
  rollout: number;
  environment: string;
}

interface FeatureFlagsProps {
  flags?: FeatureFlag[];
  className?: string;
}

export function FeatureFlags({
  flags = [],
  className = "",
}: FeatureFlagsProps) {
  const defaultFlags: FeatureFlag[] = [
    {
      name: "new-dashboard",
      status: "active",
      rollout: 100,
      environment: "production",
    },
    {
      name: "beta-features",
      status: "active",
      rollout: 25,
      environment: "production",
    },
    {
      name: "dark-mode",
      status: "active",
      rollout: 50,
      environment: "staging",
    },
    {
      name: "analytics-v2",
      status: "inactive",
      rollout: 0,
      environment: "development",
    },
  ];

  const displayFlags = flags.length > 0 ? flags : defaultFlags;

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Feature Flags
        </Text>
      </div>

      <div className="divide-y divide-border">
        {displayFlags.map((flag) => (
          <div key={flag.name} className="px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <Text size="body-sm" className="text-fg/90">
                {flag.name}
              </Text>
              <Text size="caption" className="text-fg/60">
                {flag.rollout}%
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Text size="caption" className="text-fg/60">
                {flag.status}
              </Text>
              <Text size="caption" className="text-fg/60">
                •
              </Text>
              <Text size="caption" className="text-fg/60">
                {flag.environment}
              </Text>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
