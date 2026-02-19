import {
  ArrowRight,
  Cloud,
  CodeBlock,
  GitPullRequest,
  Robot,
  Stack,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { AnimatePresence, motion } from "framer-motion";
import { useFeatureRotation } from "../hooks/useFeatureRotation";
import { FeatureListItem } from "./FeatureListItem";

interface WelcomeStepProps {
  onNext: () => void;
}

const FEATURES = [
  {
    icon: <Robot size={24} />,
    title: "Use any agent or harness",
    description:
      "Bring your own agent framework or use our built-in harnesses to get started fast.",
    placeholder: "agent-harness-illustration",
  },
  {
    icon: <Cloud size={24} />,
    title: "Run your agent anywhere",
    description:
      "Work locally, in a worktree, or spin up cloud environments on demand.",
    placeholder: "run-anywhere-illustration",
  },
  {
    icon: <CodeBlock size={24} />,
    title: "Review your code",
    description:
      "Inline diffs, focused reviews, and AI-assisted code understanding.",
    placeholder: "code-review-illustration",
  },
  {
    icon: <GitPullRequest size={24} />,
    title: "Create pull requests",
    description:
      "Go from task to PR with automated branch management and descriptions.",
    placeholder: "pull-request-illustration",
  },
  {
    icon: <Stack size={24} />,
    title: "Run many agents at once",
    description:
      "Parallelise work across multiple agents tackling different tasks simultaneously.",
    placeholder: "multi-agent-illustration",
  },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const { activeIndex, onHover, onLeave } = useFeatureRotation(FEATURES.length);

  return (
    <Flex align="center" height="100%" px="8">
      {/* Left side - features list */}
      <Flex
        direction="column"
        gap="4"
        style={{ width: "45%", maxWidth: 480 }}
        pr="6"
      >
        <Flex direction="column" gap="3" mb="4">
          <img
            src={twigLogo}
            alt="Twig"
            style={{
              height: "40px",
              objectFit: "contain",
              alignSelf: "flex-start",
            }}
          />
          <Text
            size="6"
            style={{
              fontFamily: "Halfre, serif",
              color: "var(--cave-charcoal)",
              lineHeight: 1.3,
            }}
          >
            Welcome to Twig
          </Text>
          <Text
            size="3"
            style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}
          >
            Everything you need to manage agentic workflows.
          </Text>
        </Flex>

        <Flex direction="column" gap="1">
          {FEATURES.map((feature, index) => (
            <FeatureListItem
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              isActive={index === activeIndex}
              onMouseEnter={() => onHover(index)}
              onMouseLeave={onLeave}
            />
          ))}
        </Flex>

        <Box mt="2">
          <Button
            size="3"
            onClick={onNext}
            style={{
              backgroundColor: "var(--cave-charcoal)",
              color: "var(--cave-cream)",
            }}
          >
            Get Started
            <ArrowRight size={16} />
          </Button>
        </Box>
      </Flex>

      {/* Right side - feature graphic placeholder */}
      <Flex
        align="center"
        justify="center"
        flexGrow="1"
        style={{
          height: "70%",
          maxHeight: 500,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* TODO: Replace with real illustrations */}
            <Flex
              align="center"
              justify="center"
              direction="column"
              gap="3"
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: "1px dashed rgba(45, 43, 41, 0.2)",
              }}
            >
              <Box
                style={{
                  color: "var(--cave-charcoal)",
                  opacity: 0.4,
                }}
              >
                {FEATURES[activeIndex].icon}
              </Box>
              <Text
                size="2"
                style={{ color: "var(--cave-charcoal)", opacity: 0.4 }}
              >
                {FEATURES[activeIndex].placeholder}
              </Text>
            </Flex>
          </motion.div>
        </AnimatePresence>
      </Flex>
    </Flex>
  );
}
