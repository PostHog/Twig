import { Button, Code } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";

export function StatusBarMenu() {
  const { data: appVersion } = trpcReact.os.getAppVersion.useQuery();

  return (
    <Button size="1" variant="ghost">
      <Code size="1" color="gray" variant="ghost">
        TWIG{appVersion ? ` v${appVersion}` : ""}
      </Code>
    </Button>
  );
}
