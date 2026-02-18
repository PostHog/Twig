import { Text } from "../../components/text";

interface SurveyOption {
  label: string;
  value: number;
}

interface SurveyProps {
  question?: string;
  options?: SurveyOption[];
  className?: string;
}

export function Survey({
  question,
  options = [],
  className = "",
}: SurveyProps) {
  const defaultQuestion = "Why are you unsubscribing?";
  const defaultOptions: SurveyOption[] = [
    { label: "Too expensive", value: 45 },
    { label: "Missing features", value: 32 },
    { label: "Found alternative", value: 28 },
    { label: "Poor support", value: 18 },
  ];

  const displayQuestion = question || defaultQuestion;
  const displayOptions = options.length > 0 ? options : defaultOptions;
  const max = Math.max(...displayOptions.map((o) => o.value));

  return (
    <div className={`shrink-0 border border-border bg-bg ${className}`}>
      <div className="border-border border-b px-3 py-2">
        <Text size="caption" className="font-medium">
          Survey
        </Text>
      </div>

      <div className="px-3 py-4">
        <Text size="body-sm" className="mb-4 text-fg/90">
          {displayQuestion}
        </Text>

        <div className="space-y-3">
          {displayOptions.map((option) => (
            <div key={option.label}>
              <div className="mb-1 flex items-center justify-between">
                <Text size="caption" className="text-fg/90">
                  {option.label}
                </Text>
                <Text size="caption" className="text-fg/60">
                  {option.value}%
                </Text>
              </div>
              <div className="h-2 w-full bg-fg/10">
                <div
                  className="h-full bg-fg/40"
                  style={{
                    width: `${(option.value / max) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
