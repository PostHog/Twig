import { useConnectivityStore } from "@stores/connectivityStore";

export function useConnectivity() {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const isChecking = useConnectivityStore((s) => s.isChecking);
  const showPrompt = useConnectivityStore((s) => s.showPrompt);
  const check = useConnectivityStore((s) => s.check);
  const dismiss = useConnectivityStore((s) => s.dismissPrompt);

  return { isOnline, isChecking, showPrompt, check, dismiss };
}
