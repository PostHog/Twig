import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Text } from "@components/text";
import {
  createTask,
  getGithubRepositories,
  getIntegrations,
  runTaskInCloud,
  type Integration,
} from "@/features/tasks";

export default function NewTaskScreen() {
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(true);

  const loadIntegrations = useCallback(async () => {
    try {
      setLoadingRepos(true);
      const data = await getIntegrations();
      const githubIntegrations = data.filter((i) => i.kind === "github");
      setIntegrations(githubIntegrations);

      if (githubIntegrations.length > 0) {
        const allRepos: string[] = [];
        for (const integration of githubIntegrations) {
          const repos = await getGithubRepositories(integration.id);
          allRepos.push(...repos);
        }
        setRepositories(allRepos.sort());
      }
    } catch (error) {
      console.error("Failed to fetch integrations:", error);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const handleCreateTask = useCallback(async () => {
    if (!prompt.trim() || !selectedRepo) return;

    setCreating(true);
    try {
      const githubIntegration = integrations.find((i) => i.kind === "github");

      const task = await createTask({
        description: prompt.trim(),
        title: prompt.trim().slice(0, 100),
        repository: selectedRepo,
        github_integration: githubIntegration?.id,
      });

      await runTaskInCloud(task.id);

      // Navigate to task detail (replaces current modal)
      router.replace(`/task/${task.id}`);
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setCreating(false);
    }
  }, [prompt, selectedRepo, integrations, router]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "New Task",
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#f97316",
          presentation: "modal",
        }}
      />
      <View className="flex-1 bg-dark px-3 pt-4">
        <Text className="mb-2 text-gray-500 text-xs">Repository</Text>
        {loadingRepos ? (
          <View className="mb-4 items-center rounded-lg border border-dark-border p-4">
            <ActivityIndicator size="small" color="#f97316" />
            <Text className="mt-2 text-dark-text-muted text-sm">
              Loading repositories...
            </Text>
          </View>
        ) : repositories.length === 0 ? (
          <View className="mb-4 rounded-lg border border-dark-border p-4">
            <Text className="text-center text-dark-text-muted text-sm">
              No GitHub integrations found. Please add a GitHub integration in
              PostHog settings.
            </Text>
          </View>
        ) : (
          <View className="mb-4 max-h-48 rounded-lg border border-dark-border">
            <FlatList
              data={repositories}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelectedRepo(item)}
                  className={`border-dark-border border-b px-3 py-3 ${
                    selectedRepo === item ? "bg-amber-500/20" : ""
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      selectedRepo === item ? "text-amber-400" : "text-gray-400"
                    }`}
                  >
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        )}

        <Text className="mb-2 text-gray-500 text-xs">Task description</Text>
        <TextInput
          className="mb-4 min-h-[100px] rounded-lg border border-dark-border px-3 py-3 font-mono text-sm text-white"
          placeholder="What would you like the agent to do?"
          placeholderTextColor="#6b7280"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          textAlignVertical="top"
        />

        <Pressable
          onPress={handleCreateTask}
          disabled={!prompt.trim() || !selectedRepo || creating}
          className={`rounded-lg py-3 ${
            prompt.trim() && selectedRepo && !creating
              ? "bg-orange-500"
              : "bg-dark-surface"
          }`}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              className={`text-center font-medium ${
                prompt.trim() && selectedRepo ? "text-white" : "text-gray-500"
              }`}
            >
              Create task
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

