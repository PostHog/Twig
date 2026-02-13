import {
  EnvelopeSimpleIcon,
  TrafficSignalIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";
import { InboxSetupTab } from "./InboxSetupTab";
import { InboxSignalsTab } from "./InboxSignalsTab";

type InboxTab = "signals" | "setup";

export function InboxView() {
  const [activeTab, setActiveTab] = useState<InboxTab>("signals");

  return (
    <Flex direction="column" height="100%">
      <Box className="border-gray-5 border-b bg-gray-1" px="3" py="2">
        <Flex align="center" justify="between" gap="2" className="flex-nowrap">
          <Flex align="center" gap="2" className="min-w-0">
            <EnvelopeSimpleIcon size={12} className="shrink-0 text-gray-10" />
            <Text
              size="1"
              weight="medium"
              className="whitespace-nowrap font-mono text-[12px]"
            >
              Inbox
            </Text>
          </Flex>

          <Flex align="center" gap="1" className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("signals")}
              className={`inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded border px-2 font-mono text-[11px] ${
                activeTab === "signals"
                  ? "border-gray-7 bg-gray-3 text-gray-12"
                  : "border-transparent bg-transparent text-gray-11 hover:bg-gray-2"
              }`}
            >
              <TrafficSignalIcon size={12} />
              Signals
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("setup")}
              className={`inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded border px-2 font-mono text-[11px] ${
                activeTab === "setup"
                  ? "border-gray-7 bg-gray-3 text-gray-12"
                  : "border-transparent bg-transparent text-gray-11 hover:bg-gray-2"
              }`}
            >
              <WrenchIcon size={12} />
              Setup
            </button>
          </Flex>
        </Flex>
      </Box>

      <Box style={{ flex: 1, minHeight: 0 }}>
        {activeTab === "signals" ? (
          <InboxSignalsTab onGoToSetup={() => setActiveTab("setup")} />
        ) : (
          <InboxSetupTab />
        )}
      </Box>
    </Flex>
  );
}
