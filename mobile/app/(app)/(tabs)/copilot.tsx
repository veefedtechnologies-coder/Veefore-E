import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome } from "@expo/vector-icons";

type Message = {
    id: string;
    role: "user" | "ai";
    text: string;
};

export default function CopilotScreen() {
    const [messages, setMessages] = useState<Message[]>([
        { id: "1", role: "ai", text: "Hello! I'm your VeeFore AI assistant. I can help you generate thumbnail ideas, schedule posts, or analyze your performance. try asking: 'Generate a title for my new tech review video'" }
    ]);
    const [input, setInput] = useState("");

    const handleSend = () => {
        if (!input.trim()) return;

        const newMsg: Message = { id: Date.now().toString(), role: "user", text: input };
        setMessages(prev => [...prev, newMsg]);
        setInput("");

        // Mock AI response
        setTimeout(() => {
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "ai",
                text: "That's a great topic! Here are a few viral title ideas:\n\n1. iPhone 16 Pro: The TRUTH After 1 Week\n2. DON'T Buy the iPhone 16 Until You Watch This\n3. iPhone 16 Review: Apple Changes Everything?"
            };
            setMessages(prev => [...prev, aiMsg]);
        }, 1000);
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-900">
            <View className="flex-1">
                <View className="p-4 border-b border-gray-800">
                    <Text className="text-white text-xl font-bold">AI Copilot</Text>
                </View>

                <ScrollView className="flex-1 p-4">
                    {messages.map(msg => (
                        <View key={msg.id} className={`mb-4 flex-row ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <View className={`max-w-[80%] p-4 rounded-xl ${msg.role === 'user' ? 'bg-blue-600 rounded-tr-none' : 'bg-gray-800 rounded-tl-none'}`}>
                                <Text className="text-white">{msg.text}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>

                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                    <View className="p-4 bg-gray-900 border-t border-gray-800 flex-row items-center">
                        <TextInput
                            className="flex-1 bg-gray-800 text-white p-4 rounded-full mr-4"
                            placeholder="Ask AI Copilot..."
                            placeholderTextColor="#9ca3af"
                            value={input}
                            onChangeText={setInput}
                        />
                        <TouchableOpacity onPress={handleSend} className="bg-blue-600 w-12 h-12 rounded-full items-center justify-center">
                            <FontAwesome name="send" size={20} color="white" />
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
}
