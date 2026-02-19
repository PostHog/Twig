import { useTwigAuthStore } from "@features/auth/stores/twigAuthStore";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { Badge, Button, Flex, Text } from "@radix-ui/themes";
import { useEffect } from "react";

interface BillingStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface PlanFeature {
  text: string;
}

const FREE_FEATURES: PlanFeature[] = [
  { text: "Limited usage" },
  { text: "Local execution only" },

];

const PRO_FEATURES: PlanFeature[] = [
  { text: "Unlimited usage*" },
  { text: "Local and cloud execution" },
];

export function BillingStep({ onNext, onBack }: BillingStepProps) {
  const { selectedPlan, selectPlan } = useTwigAuthStore();

  useEffect(() => {
    if (!selectedPlan) {
      selectPlan("pro");
    }
  }, [selectedPlan, selectPlan]);

  const handleContinue = () => {
    onNext();
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        gap="6"
        style={{ width: "100%", maxWidth: 520 }}
      >
        <Flex direction="column" gap="3">
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
            Choose your plan
          </Text>
          <Text size="3" style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}>
            Start free or unlock the full power of Twig.
          </Text>
        </Flex>

        <Flex direction="column" gap="3">
          {/* Free Plan */}
          <PlanCard
            name="Free"
            price="$0"
            period="/month"
            features={FREE_FEATURES}
            isSelected={selectedPlan === "free"}
            onSelect={() => selectPlan("free")}
          />

          {/* Pro Plan */}
          <PlanCard
            name="Pro"
            price="$200"
            period="/month"
            features={PRO_FEATURES}
            isSelected={selectedPlan === "pro"}
            onSelect={() => selectPlan("pro")}
            recommended
          />
        </Flex>
        <Text size="2" style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}>
          * Usage is limited to 1000 requests per day.
        </Text>
        <Flex gap="3" align="center">
          <Button
            size="3"
            variant="ghost"
            onClick={onBack}
            style={{ color: "var(--cave-charcoal)" }}
          >
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button
            size="3"
            onClick={handleContinue}
            style={{
              backgroundColor: "var(--cave-charcoal)",
              color: "var(--cave-cream)",
            }}
          >
            Continue
            <ArrowRight size={16} />
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

interface PlanCardProps {
  name: string;
  price: string;
  period: string;
  features: PlanFeature[];
  isSelected: boolean;
  onSelect: () => void;
  recommended?: boolean;
}

function PlanCard({
  name,
  price,
  period,
  features,
  isSelected,
  onSelect,
  recommended,
}: PlanCardProps) {
  return (
    <Flex
      direction="column"
      gap="4"
      p="5"
      onClick={onSelect}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        border: isSelected
          ? "2px solid var(--accent-9)"
          : "2px solid rgba(0, 0, 0, 0.1)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        backdropFilter: "blur(8px)",
      }}
    >
      <Flex align="center" justify="between">
        <Flex direction="column" gap="1">
          <Flex align="center" gap="2">
            <Text size="4" weight="bold" style={{ color: "var(--cave-charcoal)" }}>
              {name}
            </Text>
            {recommended && (
              <Badge color="orange" size="1">
                Recommended
              </Badge>
            )}
          </Flex>
          <Flex align="baseline" gap="1">
            <Text
              size="7"
              weight="bold"
              style={{ color: "var(--cave-charcoal)" }}
            >
              {price}
            </Text>
            <Text
              size="2"
              style={{ color: "var(--cave-charcoal)", opacity: 0.6 }}
            >
              {period}
            </Text>
          </Flex>
        </Flex>

        <Button
          size="2"
          variant={isSelected ? "solid" : "outline"}
          style={
            isSelected
              ? {
                  backgroundColor: "var(--accent-9)",
                  color: "white",
                }
              : {
                  color: "var(--cave-charcoal)",
                }
          }
        >
          {isSelected ? "Selected" : "Select"}
        </Button>
      </Flex>

      <Flex direction="column" gap="2">
        {features.map((feature) => (
          <Flex key={feature.text} align="center" gap="2">
            <Check
              size={14}
              weight="bold"
              style={{ color: "var(--accent-9)", flexShrink: 0 }}
            />
            <Text
              size="2"
              style={{ color: "var(--cave-charcoal)", opacity: 0.8 }}
            >
              {feature.text}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
}
