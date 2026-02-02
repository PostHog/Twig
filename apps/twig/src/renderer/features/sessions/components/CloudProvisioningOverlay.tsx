import { Cloud, CloudArrowUp, Lightning, Terminal } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";

const STAGES = [
  { text: "Provisioning cloud environment", icon: Cloud },
  { text: "Initializing container", icon: Terminal },
  { text: "Cloning repository", icon: CloudArrowUp },
  { text: "Starting agent", icon: Lightning },
];

export function CloudProvisioningOverlay() {
  const [stageIndex, setStageIndex] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);

    return () => clearInterval(dotsInterval);
  }, []);

  useEffect(() => {
    const stageInterval = setInterval(() => {
      setStageIndex((i) => (i + 1) % STAGES.length);
    }, 3000);

    return () => clearInterval(stageInterval);
  }, []);

  const CurrentIcon = STAGES[stageIndex].icon;

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="2"
      className="absolute inset-0 z-10 bg-gray-1"
    >
      <div className="cloud-container">
        <div className="cloud-glow" />
        <div className="cloud-icon">
          <CurrentIcon size={48} weight="duotone" />
        </div>
      </div>

      <Text size="2" className="text-gray-11" style={{ whiteSpace: "nowrap" }}>
        {STAGES[stageIndex].text}
        <span style={{ display: "inline-block", width: "2em", textAlign: "left" }}>{dots}</span>
      </Text>

      <div className="progress-bar">
        <div className="progress-bar-fill" />
      </div>
    </Flex>
  );
}
