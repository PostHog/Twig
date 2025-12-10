import { Audio } from "expo-av";
import { File } from "expo-file-system";
import { useCallback, useRef, useState } from "react";

type RecordingStatus = "idle" | "recording" | "transcribing" | "error";

interface UseVoiceRecordingReturn {
  status: RecordingStatus;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => Promise<void>;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setError("Microphone permission is required");
        setStatus("error");
        return;
      }

      // Configure audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create and start recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await recording.startAsync();
      recordingRef.current = recording;
      setStatus("recording");
    } catch (err) {
      console.error("Failed to start recording:", err);
      setError("Failed to start recording");
      setStatus("error");
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) {
      return null;
    }

    try {
      setStatus("transcribing");

      // Stop recording and get URI
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (!uri) {
        setError("No recording found");
        setStatus("error");
        return null;
      }

      const openaiApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
      if (!openaiApiKey) {
        setError("EXPO_PUBLIC_OPENAI_API_KEY not set");
        setStatus("error");
        return null;
      }

      // Create form data with the recording file
      const formData = new FormData();
      formData.append("file", {
        uri,
        type: "audio/m4a",
        name: "recording.m4a",
      } as unknown as Blob);
      formData.append("model", "gpt-4o-transcribe");

      // Call OpenAI transcription API
      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: formData,
        },
      );

      // Clean up the temp file
      const recordingFile = new File(uri);
      if (recordingFile.exists) {
        await recordingFile.delete();
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Transcription failed: ${errorData}`);
      }

      const data = await response.json();
      setStatus("idle");
      return data.text;
    } catch (err) {
      console.error("Failed to transcribe:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Transcription failed";
      setError(errorMessage);
      setStatus("error");
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        if (uri) {
          const file = new File(uri);
          if (file.exists) {
            await file.delete();
          }
        }
      } catch {
        // Ignore cleanup errors
      }
      recordingRef.current = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
