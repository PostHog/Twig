import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import type { Preview } from "@storybook/react-vite";
import "../src/renderer/styles/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#111113" },
        { name: "light", value: "#ffffff" },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const isDark = context.globals.theme !== "light";
      return (
        <Theme
          appearance={isDark ? "dark" : "light"}
          accentColor={isDark ? "orange" : "yellow"}
          grayColor="slate"
          panelBackground="solid"
          radius="none"
          scaling="105%"
        >
          <Story />
        </Theme>
      );
    },
  ],
  globalTypes: {
    theme: {
      description: "Theme",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: ["dark", "light"],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
