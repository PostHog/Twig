import { Redirect } from "expo-router";
import { useAuthStore } from "../stores/authStore";

export default function Index() {
  const { isAuthenticated } = useAuthStore();

  // Redirect to auth tabs if authenticated, otherwise to login
  if (isAuthenticated) {
    return <Redirect href="/(auth)" />;
  }

  return <Redirect href="/auth" />;
}
