import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createTask,
  getGithubRepositories,
  getIntegrations,
  getTasks,
  runTaskInCloud,
} from "../../features/agent/lib/agentApi";
import type { Integration, Task } from "../../features/agent/types/agent";

export default function AgentScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showNewTask, setShowNewTask] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await getTasks();
      setTasks(
        data.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      );
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    }
  }, []);

  const loadIntegrations = useCallback(async () => {
    try {
      const data = await getIntegrations();
      const githubIntegrations = data.filter((i) => i.kind === "github");
      setIntegrations(githubIntegrations);

      if (githubIntegrations.length > 0) {
        setLoadingRepos(true);
        const allRepos: string[] = [];
        for (const integration of githubIntegrations) {
          const repos = await getGithubRepositories(integration.id);
          allRepos.push(...repos);
        }
        setRepositories(allRepos.sort());
        setLoadingRepos(false);
      }
    } catch (error) {
      console.error("Failed to fetch integrations:", error);
      setLoadingRepos(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTasks().finally(() => setLoading(false));
  }, [fetchTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  const handleNewTask = useCallback(() => {
    setShowNewTask(true);
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

      setShowNewTask(false);
      setPrompt("");
      setSelectedRepo(null);

      router.push(`/(auth)/agent/${task.id}`);
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setCreating(false);
    }
  }, [prompt, selectedRepo, integrations, router]);

  const renderTask = useCallback(
    ({ item }: { item: Task }) => (
      <Link href={`/(auth)/agent/${item.id}`} asChild>
        <Pressable className="bg-neutral-800 rounded-xl p-4 mb-3">
          <Text className="text-white font-medium mb-1" numberOfLines={2}>
            {item.title || item.description}
          </Text>
          {item.repository && (
            <Text className="text-neutral-400 text-sm">{item.repository}</Text>
          )}
          <View className="flex-row justify-between items-center mt-2">
            <Text className="text-neutral-500 text-xs">
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
            {item.latest_run && (
              <View
                className={`px-2 py-1 rounded ${
                  item.latest_run.status === "completed"
                    ? "bg-green-900"
                    : item.latest_run.status === "failed"
                      ? "bg-red-900"
                      : "bg-blue-900"
                }`}
              >
                <Text className="text-white text-xs">
                  {item.latest_run.status}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </Link>
    ),
    [],
  );

  if (showNewTask) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-900">
        <View className="flex-1 px-4 pt-4">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-white text-xl font-bold">
              New Conversation
            </Text>
            <Pressable onPress={() => setShowNewTask(false)}>
              <Text className="text-blue-500">Cancel</Text>
            </Pressable>
          </View>

          <Text className="text-neutral-400 text-sm mb-2">Repository</Text>
          {loadingRepos ? (
            <View className="bg-neutral-800 rounded-xl p-4 mb-4 items-center">
              <ActivityIndicator size="small" color="#6b7280" />
              <Text className="text-neutral-500 text-sm mt-2">
                Loading repositories...
              </Text>
            </View>
          ) : repositories.length === 0 ? (
            <View className="bg-neutral-800 rounded-xl p-4 mb-4">
              <Text className="text-neutral-500 text-center">
                No GitHub integrations found. Please add a GitHub integration in
                PostHog settings.
              </Text>
            </View>
          ) : (
            <View className="bg-neutral-800 rounded-xl mb-4 max-h-48">
              <FlatList
                data={repositories}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setSelectedRepo(item)}
                    className={`px-4 py-3 border-b border-neutral-700 ${
                      selectedRepo === item ? "bg-blue-900" : ""
                    }`}
                  >
                    <Text
                      className={`${
                        selectedRepo === item
                          ? "text-white"
                          : "text-neutral-300"
                      }`}
                    >
                      {item}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          )}

          <Text className="text-neutral-400 text-sm mb-2">
            What would you like the agent to do?
          </Text>
          <TextInput
            className="bg-neutral-800 text-white px-4 py-3 rounded-xl mb-4 min-h-[100px]"
            placeholder="Describe your task..."
            placeholderTextColor="#6b7280"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            onPress={handleCreateTask}
            disabled={!prompt.trim() || !selectedRepo || creating}
            className={`rounded-xl p-4 ${
              prompt.trim() && selectedRepo && !creating
                ? "bg-blue-600"
                : "bg-neutral-700"
            }`}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white text-center font-medium">
                Start Conversation
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-900">
      <View className="flex-1 px-4 pt-4">
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-white text-xl font-bold">Array Agent</Text>
            <Text className="text-neutral-400 text-sm">
              Your agent conversations
            </Text>
          </View>
          <Pressable
            onPress={handleNewTask}
            className="bg-blue-600 px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-medium">New</Text>
          </Pressable>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#6b7280" />
          </View>
        ) : tasks.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-neutral-500 text-center mb-4">
              No conversations yet
            </Text>
            <Pressable
              onPress={handleNewTask}
              className="bg-blue-600 px-6 py-3 rounded-xl"
            >
              <Text className="text-white font-medium">
                Start a Conversation
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={tasks}
            renderItem={renderTask}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#6b7280"
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
