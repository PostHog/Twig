import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import { useCallback, useEffect, useState } from "react";

export function useConnectivity() {
  const { data } = trpcReact.connectivity.getStatus.useQuery();
  const [isOnline, setIsOnline] = useState(data?.isOnline ?? true);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (data) {
      setIsOnline(data.isOnline);
    }
  }, [data]);

  useEffect(() => {
    const subscription = trpcVanilla.connectivity.onStatusChange.subscribe(
      undefined,
      {
        onData: (status) => {
          setIsOnline(status.isOnline);
          setIsChecking(false);
        },
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const check = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await trpcVanilla.connectivity.checkNow.mutate();
      setIsOnline(result.isOnline);
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { isOnline, isChecking, check };
}
