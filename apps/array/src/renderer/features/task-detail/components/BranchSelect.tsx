import { GitBranchIcon, PlusIcon } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text, TextField } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_DISPLAYED_BRANCHES = 20;

interface BranchSelectProps {
  value: string | null; // null means use default branch
  onChange: (branch: string | null) => void;
  directoryPath: string;
  size?: Responsive<"1" | "2">;
}

export function BranchSelect({
  value,
  onChange,
  directoryPath,
  size = "1",
}: BranchSelectProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string>("");
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
      return;
    }

    let cancelled = false;
    hasSetInitialValue.current = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [allBranches, detectedDefault] = await Promise.all([
          window.electronAPI.getAllBranches(directoryPath),
          window.electronAPI.getDefaultBranch(directoryPath),
        ]);

        if (cancelled) return;

        setBranches(allBranches);
        setDefaultBranch(detectedDefault);
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

  useEffect(() => {
    if (!hasSetInitialValue.current && value === null && defaultBranch) {
      hasSetInitialValue.current = true;
      onChange(defaultBranch);
    }
  }, [defaultBranch, value, onChange]);

  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        setSearchQuery("");
        if (directoryPath) {
          try {
            const [allBranches, detectedDefault] = await Promise.all([
              window.electronAPI.getAllBranches(directoryPath),
              window.electronAPI.getDefaultBranch(directoryPath),
            ]);
            setBranches(allBranches);
            setDefaultBranch(detectedDefault);
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

  // filter branches based on search query
  const filteredBranches = useMemo(() => {
    let result = branches;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = branches.filter((branch) =>
        branch.toLowerCase().includes(query),
      );
    }
    return result.slice(0, MAX_DISPLAYED_BRANCHES);
  }, [branches, searchQuery]);

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
        <Button color="gray" variant="outline" size={size} disabled={isLoading}>
          <Flex justify="between" align="center" gap="2">
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              <GitBranchIcon size={16} weight="regular" />
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
