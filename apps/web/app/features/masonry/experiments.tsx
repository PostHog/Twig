import { Text } from "../../components/text";

interface Experiment {
  name: string;
  status: "running" | "completed" | "draft";
  variant: string;
  probability: number;
}

interface ExperimentsProps {
  experiments?: Experiment[];
  className?: string;
}

export function Experiments({
  experiments = [],
  className = "",
}: ExperimentsProps) {
  const defaultExperiments: Experiment[] = [
    {
      name: "New checkout flow",
      status: "running",
      variant: "test",
      probability: 95,
    },
    {
      name: "Homepage redesign",
      status: "running",
      variant: "control",
      probability: 78,
    },
    {
      name: "Pricing page A/B",
      status: "completed",
      variant: "test",
      probability: 99,
    },
    {
      name: "Onboarding survey",
      status: "draft",
      variant: "test",
      probability: 45,
    },
  ];

  const displayExperiments =
    experiments.length > 0 ? experiments : defaultExperiments;

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Experiments
        </Text>
      </div>

      <div className="divide-y divide-border">
        {displayExperiments.map((experiment) => (
          <div key={experiment.name} className="px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <Text size="body-sm" className="text-fg/90">
                {experiment.name}
              </Text>
              <Text size="caption" className="text-fg/60">
                {experiment.probability}%
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Text size="caption" className="text-fg/60">
                {experiment.status}
              </Text>
              <Text size="caption" className="text-fg/60">
                •
              </Text>
              <Text size="caption" className="text-fg/60">
                {experiment.variant}
              </Text>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
