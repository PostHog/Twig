import { GitBranchIcon, PlusIcon } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text, TextField } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";
import { trpcVanilla } from "@renderer/trpc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunMode } from "./RunModeSelect";

const MAX_DISPLAYED_BRANCHES = 20;

interface BranchSelectProps {
  value: string | null; // null means use default branch
  onChange: (branch: string | null) => void;
  directoryPath: string;
  runMode: RunMode;
  size?: Responsive<"1" | "2">;
}

export function BranchSelect({
  value,
  onChange,
  directoryPath,
  runMode,
  size = "1",
}: BranchSelectProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string>("");
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const hasSetInitialValue = useRef(false);

  useEffect(() => {
    if (!directoryPath) {
      setIsLoading(false);
      setBranches([]);
      setDefaultBranch("");
      setCurrentBranch("");
      return;
    }

    let cancelled = false;
    hasSetInitialValue.current = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [allBranches, detectedDefault, detectedCurrent] =
          await Promise.all([
            trpcVanilla.git.getAllBranches.query({
              directoryPath,
            }),
            trpcVanilla.git.getDefaultBranch.query({
              directoryPath,
            }),
            trpcVanilla.git.getCurrentBranch.query({
              directoryPath,
            }),
          ]);

        if (cancelled) return;

        setBranches(allBranches);
        setDefaultBranch(detectedDefault);
        setCurrentBranch(detectedCurrent ?? "");
      } catch (_error) {
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [directoryPath]);

  // Determine which branch to use as the initial value based on run mode
  const initialBranch =
    runMode === "local" ? currentBranch || defaultBranch : defaultBranch;

  useEffect(() => {
    if (!hasSetInitialValue.current && value === null && initialBranch) {
      hasSetInitialValue.current = true;
      onChange(initialBranch);
    }
  }, [initialBranch, value, onChange]);

  // Reset branch selection when runMode changes
  useEffect(() => {
    if (initialBranch) {
      onChange(initialBranch);
    }
  }, [initialBranch, onChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        setSearchQuery("");
        if (directoryPath) {
          try {
            const [allBranches, detectedDefault, detectedCurrent] =
              await Promise.all([
                trpcVanilla.git.getAllBranches.query({
                  directoryPath,
                }),
                trpcVanilla.git.getDefaultBranch.query({
                  directoryPath,
                }),
                trpcVanilla.git.getCurrentBranch.query({
                  directoryPath,
                }),
              ]);
            setBranches(allBranches);
            setDefaultBranch(detectedDefault);
            setCurrentBranch(detectedCurrent ?? "");
          } catch (_error) {}
        }
      }
    },
    [directoryPath],
  );

  const handleCreateNew = () => {
    setIsCreatingNew(true);
    setNewBranchName(searchQuery);
  };

  const handleCancelCreate = () => {
    setIsCreatingNew(false);
    setNewBranchName("");
  };

  const handleConfirmCreate = () => {
    if (newBranchName.trim()) {
      onChange(newBranchName.trim());
      setIsCreatingNew(false);
      setNewBranchName("");
    }
  };

  // filter and sort branches based on search query
  const filteredBranches = useMemo(() => {
    let result = branches;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = branches.filter((branch) =>
        branch.toLowerCase().includes(query),
      );
    }
    // Sort alphabetically, but default branch always comes first
    result = [...result].sort((a, b) => {
      if (a === defaultBranch) return -1;
      if (b === defaultBranch) return 1;
      return a.localeCompare(b);
    });
    return result.slice(0, MAX_DISPLAYED_BRANCHES);
  }, [branches, searchQuery, defaultBranch]);

  const hasMoreBranches =
    branches.length > MAX_DISPLAYED_BRANCHES && !searchQuery;

  const displayValue = value || defaultBranch || "Select branch";

  if (isCreatingNew) {
    return (
      <Flex gap="2" align="center">
        <TextField.Root
          size={size}
          placeholder="New branch name..."
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleConfirmCreate();
            } else if (e.key === "Escape") {
              handleCancelCreate();
            }
          }}
          autoFocus
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          size={size}
          variant="soft"
          onClick={handleConfirmCreate}
          disabled={!newBranchName.trim()}
        >
          Create
        </Button>
        <Button size={size} variant="ghost" onClick={handleCancelCreate}>
          Cancel
        </Button>
      </Flex>
    );
  }

  return (
    <DropdownMenu.Root onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger>
        <Button
          color="gray"
          variant="outline"
          size={size}
          disabled={isLoading}
          style={{ maxWidth: 280, overflow: "hidden" }}
        >
          <Flex
            justify="between"
            align="center"
            gap="2"
            style={{ minWidth: 0 }}
          >
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              <GitBranchIcon
                size={16}
                weight="regular"
                style={{ flexShrink: 0 }}
              />
              <Text
                size={size}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayValue}
              </Text>
            </Flex>
            <ChevronDownIcon style={{ flexShrink: 0 }} />
          </Flex>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="start"
        style={{ minWidth: "200px", maxHeight: "300px", overflowY: "auto" }}
        size={size}
      >
        <div style={{ padding: "4px 8px" }}>
          <TextField.Root
            size="1"
            placeholder="Filter branches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <DropdownMenu.Separator />

        {defaultBranch && filteredBranches.includes(defaultBranch) && (
          <DropdownMenu.Item onSelect={() => onChange(defaultBranch)}>
            <Flex align="center" gap="2">
              <GitBranchIcon size={12} weight="bold" />
              <Text size={size} weight="medium">
                {defaultBranch}
              </Text>
            </Flex>
          </DropdownMenu.Item>
        )}

        {filteredBranches.filter((branch) => branch !== defaultBranch).length >
          0 && (
          <>
            {defaultBranch && filteredBranches.includes(defaultBranch) && (
              <DropdownMenu.Separator />
            )}
            {filteredBranches
              .filter((branch) => branch !== defaultBranch)
              .map((branch) => (
                <DropdownMenu.Item
                  key={branch}
                  onSelect={() => onChange(branch)}
                >
                  <Flex align="center" gap="2">
                    <GitBranchIcon size={12} />
                    <Text size={size}>{branch}</Text>
                  </Flex>
                </DropdownMenu.Item>
              ))}
          </>
        )}

        {hasMoreBranches && (
          <DropdownMenu.Label>
            <Text size="1" color="gray">
              Type to filter {branches.length - MAX_DISPLAYED_BRANCHES} more...
            </Text>
          </DropdownMenu.Label>
        )}

        {filteredBranches.length === 0 && searchQuery && (
          <DropdownMenu.Label>
            <Text size="1" color="gray">
              No branches match "{searchQuery}"
            </Text>
          </DropdownMenu.Label>
        )}

        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={handleCreateNew}>
          <Flex align="center" gap="2">
            <PlusIcon size={12} />
            <Text size={size}>
              {searchQuery ? `Create "${searchQuery}"` : "Create new branch..."}
            </Text>
          </Flex>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
