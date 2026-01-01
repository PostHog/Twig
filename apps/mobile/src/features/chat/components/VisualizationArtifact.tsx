import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useAuthStore } from "@/features/auth";
import { useThemeColors } from "@/lib/useThemeColors";
import type {
  ArtifactMessage,
  MessageStatus,
  VisualizationArtifactContent,
} from "../types";

interface VisualizationArtifactProps {
  message: ArtifactMessage & { status?: MessageStatus };
  content: VisualizationArtifactContent;
}

export function VisualizationArtifact({
  message,
  content,
}: VisualizationArtifactProps) {
  const webViewRef = useRef<WebView>(null);
  const themeColors = useThemeColors();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // biome-ignore lint/suspicious/noExplicitAny: Query results structure varies
  const [queryResults, setQueryResults] = useState<Record<string, any> | null>(
    content.cachedResults || null,
  );

  const cloudRegion = useAuthStore((state) => state.cloudRegion);
  const projectId = useAuthStore((state) => state.projectId);
  const accessToken = useAuthStore((state) => state.oauthAccessToken);
  const { getCloudUrlFromRegion } = useAuthStore.getState();

  const cloudUrl = cloudRegion ? getCloudUrlFromRegion(cloudRegion) : null;
  const renderQueryUrl = cloudUrl ? `${cloudUrl}/render_query` : null;

  // Fetch query results from the API if not already cached
  useEffect(() => {
    if (queryResults || !cloudUrl || !projectId || !accessToken) {
      return;
    }

    const fetchQueryResults = async () => {
      try {
        const response = await fetch(
          `${cloudUrl}/api/projects/${projectId}/query/`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: content.query }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Query API error:", response.status, errorText);
          setHasError(true);
          setErrorMessage(`Query failed: ${response.status}`);
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        setQueryResults(data);
      } catch (error) {
        console.error("Failed to fetch query results:", error);
        setHasError(true);
        setErrorMessage("Failed to fetch data");
        setIsLoading(false);
      }
    };

    fetchQueryResults();
  }, [cloudUrl, projectId, accessToken, content.query, queryResults]);

  // Build the query wrapped in InsightVizNode if needed
  const wrappedQuery = useMemo(() => {
    // If the query is already an InsightVizNode, use it directly
    if (content.query.kind === "InsightVizNode") {
      return content.query;
    }
    // Otherwise wrap it in InsightVizNode
    return {
      kind: "InsightVizNode",
      source: content.query,
    };
  }, [content.query]);

  // Build the payload to send to the WebView
  const payload = useMemo(
    () => ({
      query: wrappedQuery,
      cachedResults: queryResults,
    }),
    [wrappedQuery, queryResults],
  );

  // JavaScript to inject that sends the payload via postMessage
  const injectedJavaScript = useMemo(() => {
    if (!renderQueryUrl || !queryResults) return "";
    const targetOrigin = new URL(renderQueryUrl).origin;
    return `
      (function() {
        // Force dark theme
        document.body.setAttribute('theme', 'dark');
        
        const payload = ${JSON.stringify(payload)};
        const targetOrigin = "${targetOrigin}";
        
        function send() {
          // Ensure dark theme persists
          document.body.setAttribute('theme', 'dark');
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          window.postMessage(payload, targetOrigin);
        }
        
        // Send immediately and also on load
        if (document.readyState === 'complete') {
          send();
        } else {
          window.addEventListener('load', send);
        }
        
        // Also try after a short delay to ensure the page is fully ready
        setTimeout(send, 500);
        setTimeout(send, 1500);
      })();
      true;
    `;
  }, [payload, renderQueryUrl, queryResults]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "ready") {
        setIsLoading(false);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setErrorMessage("Failed to load visualization");
    setIsLoading(false);
  }, []);

  const handleLoadEnd = useCallback(() => {
    // Give a bit more time for the chart to render
    setTimeout(() => setIsLoading(false), 1000);
  }, []);

  if (message.status !== "completed") {
    return null;
  }

  if (!renderQueryUrl || !projectId || !accessToken) {
    return (
      <View className="items-start px-4 py-3">
        <View className="max-w-[85%] rounded bg-status-error/20 px-4 py-3">
          <Text className="font-mono text-[13px] text-status-error">
            Unable to load visualization: Not authenticated
          </Text>
        </View>
      </View>
    );
  }

  if (hasError) {
    return (
      <View className="items-start px-4 py-3">
        <View className="max-w-[85%] rounded bg-status-error/20 px-4 py-3">
          <Text className="font-mono text-[13px] text-status-error">
            {errorMessage || "Failed to load visualization"}
          </Text>
        </View>
      </View>
    );
  }

  // Show loading while fetching query results
  if (!queryResults) {
    return (
      <View className="w-full items-start px-4 py-3">
        <View className="w-full overflow-hidden rounded bg-gray-6">
          {content.name && (
            <View className="border-b border-gray-7 px-4 py-2">
              <Text className="font-mono text-[13px] text-gray-12">
                {content.name}
              </Text>
            </View>
          )}
          <View className="h-80 w-full items-center justify-center">
            <ActivityIndicator size="large" color={themeColors.accent[9]} />
            <Text className="mt-2 font-mono text-[13px] text-gray-9">
              Fetching data...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="w-full items-start px-4 py-3">
      <View className="w-full overflow-hidden rounded bg-gray-6">
        {/* Header with title */}
        {content.name && (
          <View className="border-b border-gray-7 px-4 py-2">
            <Text className="font-mono text-[13px] text-gray-12">
              {content.name}
            </Text>
          </View>
        )}

        {/* WebView container */}
        <View className="relative h-80 w-full">
          {isLoading && (
            <View className="absolute inset-0 z-10 items-center justify-center bg-gray-6">
              <ActivityIndicator size="large" color={themeColors.accent[9]} />
              <Text className="mt-2 font-mono text-[13px] text-gray-9">
                Loading visualization...
              </Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: renderQueryUrl }}
            injectedJavaScript={injectedJavaScript}
            onMessage={handleMessage}
            onError={handleError}
            onLoadEnd={handleLoadEnd}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            scalesPageToFit
            style={{ flex: 1, backgroundColor: themeColors.gray[2] }}
            containerStyle={{ flex: 1 }}
          />
        </View>

        {/* Artifact name */}
        {content.name && (
          <View className="border-t border-gray-7 px-4 py-2">
            <Text className="font-mono text-[11px] text-gray-9">
              {content.name}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
