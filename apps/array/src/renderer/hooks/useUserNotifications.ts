import { trpcReact } from "@renderer/trpc/client";
import { toast } from "@utils/toast";

export function useUserNotifications() {
  trpcReact.userNotification.onNotify.useSubscription(undefined, {
    onData: ({ severity, title, description }) => {
      switch (severity) {
        case "error":
          toast.error(title, { description });
          break;
        case "warning":
          toast.warning(title, { description });
          break;
        case "info":
          toast.info(title, description);
          break;
      }
    },
  });
}
