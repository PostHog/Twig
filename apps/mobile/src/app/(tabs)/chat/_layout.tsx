import { Stack } from "expo-router";

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: "#09090b" },
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: "Chat",
          headerLargeTitle: false,
        }}
      />
    </Stack>
  );
}
