import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS, Platform } from "react-native";

export default function AuthTabLayout() {
  // Dynamic colors for liquid glass effect on iOS
  const dynamicTextColor = Platform.select({
    ios: DynamicColorIOS({
      dark: "white",
      light: "black",
    }),
    default: "white",
  });

  const dynamicTintColor = Platform.select({
    ios: DynamicColorIOS({
      dark: "#f97316", // orange-500
      light: "#ea580c", // orange-600
    }),
    default: "#f97316",
  });

  return (
    <NativeTabs
      labelStyle={{
        color: dynamicTextColor,
      }}
      tintColor={dynamicTintColor}
      minimizeBehavior="onScrollDown"
    >
      {/* Tasks - Home Tab */}
      <NativeTabs.Trigger name="index">
        <Label>Tasks</Label>
        <Icon
          sf={{ default: "checklist", selected: "checklist" }}
          drawable="ic_menu_agenda"
        />
      </NativeTabs.Trigger>

      {/* Chat - New Chat Tab with + icon */}
      <NativeTabs.Trigger name="chat">
        <Label>Chat</Label>
        <Icon
          sf={{ default: "plus.circle", selected: "plus.circle.fill" }}
          drawable="ic_menu_add"
        />
      </NativeTabs.Trigger>

      {/* Settings/Profile Tab */}
      <NativeTabs.Trigger name="settings">
        <Label>Profile</Label>
        <Icon
          sf={{ default: "person", selected: "person.fill" }}
          drawable="ic_menu_preferences"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
