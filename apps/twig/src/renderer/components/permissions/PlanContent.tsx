import { Box } from "@radix-ui/themes";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PlanContentProps {
  plan: string;
}

export function PlanContent({ plan }: PlanContentProps) {
  return (
    <Box className="max-h-[50vh] overflow-y-auto rounded-lg border-2 border-blue-6 bg-blue-2 p-4">
      <Box className="plan-markdown text-blue-12">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan}</ReactMarkdown>
      </Box>
    </Box>
  );
}
