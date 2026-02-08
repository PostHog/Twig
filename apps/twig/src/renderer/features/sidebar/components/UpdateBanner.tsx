import { ArrowsClockwise } from "@phosphor-icons/react";
import { trpcReact } from "@renderer/trpc";
import { useState } from "react";

export function UpdateBanner() {
  const { data: isEnabledData } = trpcReact.updates.isEnabled.useQuery();
  const isEnabled = isEnabledData?.enabled ?? false;

  const utils = trpcReact.useUtils();
  const { data } = trpcReact.updates.isUpdateReady.useQuery();
  const installMutation = trpcReact.updates.install.useMutation();
  const [installError, setInstallError] = useState(false);

  trpcReact.updates.onReady.useSubscription(undefined, {
    enabled: isEnabled,
    onData: () => {
      utils.updates.isUpdateReady.invalidate();
    },
  });

  if (!data?.ready) {
    return null;
  }

  const handleRestart = async () => {
    setInstallError(false);
    try {
      const result = await installMutation.mutateAsync();
      if (!result.installed) {
        setInstallError(true);
      }
    } catch {
      setInstallError(true);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRestart}
      disabled={installMutation.isPending}
      className="flex w-full cursor-pointer items-center gap-2 border-0 px-3 py-2 font-mono text-[12px] transition-colors hover:opacity-90"
      style={{
        backgroundColor: installError ? "var(--red-9)" : "var(--accent-9)",
        color: installError ? "white" : "black",
      }}
    >
      <ArrowsClockwise
        size={14}
        weight="bold"
        className={installMutation.isPending ? "animate-spin" : ""}
      />
      <span>
        {installError
          ? "Update failed"
          : installMutation.isPending
            ? "Restarting..."
            : "Restart to update"}
      </span>
    </button>
  );
}
