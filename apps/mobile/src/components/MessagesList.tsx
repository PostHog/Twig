import React from 'react';
import { View, Text, FlatList } from 'react-native';

export interface Message {
  id: string;
  text: string;
}

interface MessagesListProps {
  messages: Message[];
}

export function MessagesList({ messages }: MessagesListProps) {
  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      inverted
      renderItem={({ item }) => (
        <View className="py-2 px-4">
          <Text className="text-white text-base">{item.text}</Text>
        </View>
      )}
      contentContainerStyle={{ flexGrow: 1 }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center">
          <Text className="text-dark-text-muted text-base">No messages yet</Text>
        </View>
      }
    />
  );
}

