import { SettingRow } from "@features/settings/components/SettingRow";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { ArrowSquareOut, Check, Copy, Warning } from "@phosphor-icons/react";
import {
  AlertDialog,
  Button,
  Callout,
  Flex,
  IconButton,
  Link,
  Switch,
  Text,
} from "@radix-ui/themes";
import { Tooltip } from "@renderer/components/ui/Tooltip";
import { track } from "@renderer/lib/analytics";
import { useCallback, useState } from "react";
import { ANALYTICS_EVENTS } from "@/types/analytics";

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [command]);

  return (
    <Flex
      align="center"
      gap="2"
      className="rounded border border-gray-6 bg-gray-2 px-2 py-1"
    >
      <Text size="1" className="font-mono text-gray-11">
        {command}
      </Text>
      <Tooltip content={copied ? "Copied!" : "Copy"}>
        <IconButton
          variant="ghost"
          size="1"
          color={copied ? "green" : "gray"}
          onClick={handleCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </IconButton>
      </Tooltip>
    </Flex>
  );
}

function SettingDescription({
  text,
  docsUrl,
}: {
  text: string;
  docsUrl: string;
}) {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        {text}
      </Text>
      <Link href={docsUrl} target="_blank" size="1">
        <Flex align="center" gap="1">
          Documentation
          <ArrowSquareOut size={10} />
        </Flex>
      </Link>
    </Flex>
  );
}

export function ClaudeCodeSettings() {
  const { allowBypassPermissions, setAllowBypassPermissions } =
    useSettingsStore();

  const [showBypassWarning, setShowBypassWarning] = useState(false);

  const handleBypassPermissionsChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        setShowBypassWarning(true);
      } else {
        track(ANALYTICS_EVENTS.SETTING_CHANGED, {
          setting_name: "allow_bypass_permissions",
          new_value: false,
          old_value: true,
        });
        setAllowBypassPermissions(false);
      }
    },
    [setAllowBypassPermissions],
  );

  const handleConfirmBypassPermissions = useCallback(() => {
    track(ANALYTICS_EVENTS.SETTING_CHANGED, {
      setting_name: "allow_bypass_permissions",
      new_value: true,
      old_value: false,
    });
    setAllowBypassPermissions(true);
    setShowBypassWarning(false);
  }, [setAllowBypassPermissions]);

  return (
    <Flex direction="column">
      <SettingRow
        label="Enable Bypass Permissions mode"
        description="Enables 'Bypass Permissions' mode in the execution mode selector. When active, Twig will not ask for approval before running potentially dangerous commands."
      >
        <Switch
          checked={allowBypassPermissions}
          onCheckedChange={handleBypassPermissionsChange}
          size="1"
          color="red"
        />
      </SettingRow>
      {allowBypassPermissions && (
        <Callout.Root size="1" color="red" mb="3">
          <Callout.Icon>
            <Warning weight="fill" />
          </Callout.Icon>
          <Callout.Text>
            Bypass Permissions mode is enabled. Use with extreme caution.
          </Callout.Text>
        </Callout.Root>
      )}

      <SettingRow
        label="MCP servers"
        description={
          <SettingDescription
            text="Extend Claude's capabilities with MCP servers"
            docsUrl="https://docs.anthropic.com/en/docs/claude-code/mcp"
          />
        }
      >
        <CopyableCommand command="claude mcp" />
      </SettingRow>

      <SettingRow
        label="Skills"
        description={
          <SettingDescription
            text="Create custom slash commands in ~/.claude/skills/"
            docsUrl="https://docs.anthropic.com/en/docs/claude-code/slash-commands"
          />
        }
      >
        <span />
      </SettingRow>

      <SettingRow
        label="Memory"
        description={
          <SettingDescription
            text="Persistent context stored in CLAUDE.md files"
            docsUrl="https://docs.anthropic.com/en/docs/claude-code/memory"
          />
        }
      >
        <CopyableCommand command="claude /memory" />
      </SettingRow>

      <SettingRow
        label="Hooks"
        description={
          <SettingDescription
            text="Execute commands at specific points in Claude's lifecycle"
            docsUrl="https://docs.anthropic.com/en/docs/claude-code/hooks"
          />
        }
        noBorder
      >
        <CopyableCommand command="claude /hooks" />
      </SettingRow>

      <AlertDialog.Root
        open={showBypassWarning}
        onOpenChange={setShowBypassWarning}
      >
        <AlertDialog.Content maxWidth="500px">
          <AlertDialog.Title color="red">
            <Flex align="center" gap="2">
              <Warning size={20} weight="fill" color="var(--red-9)" />
              <Text color="red" weight="bold">
                Enable Bypass Permissions mode
              </Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="3">
              <Text color="red" weight="medium">
                In Bypass Permissions mode, Twig will not ask for your approval
                before running potentially dangerous commands.
              </Text>
              <Text>
                This mode should only be used in a sandboxed container/VM that
                has restricted internet access and can easily be restored if
                damaged.
              </Text>
              <Text weight="medium">
                By proceeding, you accept all responsibility for actions taken
                while running in Bypass Permissions mode.
              </Text>
            </Flex>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                No, exit
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color="red"
                onClick={handleConfirmBypassPermissions}
              >
                Yes, I accept
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
}
