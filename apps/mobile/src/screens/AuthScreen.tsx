import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';
import type { CloudRegion } from '../types/oauth';

const REGIONS: { value: CloudRegion; label: string }[] = [
  { value: 'us', label: 'US Cloud' },
  { value: 'eu', label: 'EU Cloud' },
];

// Add dev region in development
if (__DEV__) {
  REGIONS.push({ value: 'dev', label: 'Development' });
}

export function AuthScreen() {
  const [selectedRegion, setSelectedRegion] = useState<CloudRegion>('us');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { loginWithOAuth } = useAuthStore();

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await loginWithOAuth(selectedRegion);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to authenticate';
      
      // Handle specific error cases
      if (message.includes('cancelled') || message.includes('cancel')) {
        setError('Authorization cancelled.');
      } else if (message.includes('timed out')) {
        setError('Authorization timed out. Please try again.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>PostHog Mobile</Text>
          <Text style={styles.subtitle}>Sign in with your PostHog account</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>PostHog region</Text>
          <View style={styles.regionPicker}>
            {REGIONS.map((region) => (
              <TouchableOpacity
                key={region.value}
                style={[
                  styles.regionOption,
                  selectedRegion === region.value && styles.regionOptionSelected,
                ]}
                onPress={() => setSelectedRegion(region.value)}
              >
                <Text
                  style={[
                    styles.regionOptionText,
                    selectedRegion === region.value && styles.regionOptionTextSelected,
                  ]}
                >
                  {region.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {isLoading && (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>
                Waiting for authorization in your browser...
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.signInButton, isLoading && styles.signInButtonDisabled]}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signInButtonText}>Sign in with PostHog</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
    marginBottom: 8,
  },
  regionPicker: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  regionOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  regionOptionSelected: {
    borderColor: '#f97316',
    backgroundColor: '#1f1512',
  },
  regionOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  regionOptionTextSelected: {
    color: '#f97316',
  },
  errorContainer: {
    backgroundColor: '#2d1f1f',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
  },
  loadingContainer: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  loadingText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  signInButton: {
    backgroundColor: '#f97316',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  signInButtonDisabled: {
    backgroundColor: '#666',
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
