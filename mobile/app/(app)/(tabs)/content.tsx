import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome } from "@expo/vector-icons";
import api from "../../../lib/api";

type Post = {
    id: string;
    title: string;
    platform: "instagram" | "youtube";
    scheduledTime: string;
    status: "scheduled" | "published" | "draft";
};

export default function ContentScreen() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            // Fetch user's workspaces first
            const workspacesRes = await api.get('/workspaces/');
            const workspaces = workspacesRes.data;

            if (workspaces && workspaces.length > 0) {
                const workspaceId = workspaces[0].id;

                // Fetch scheduled content
                const res = await api.get(`/content/workspace/${workspaceId}/scheduled`);

                if (res.data && Array.isArray(res.data)) {
                    const mappedPosts: Post[] = res.data.map((post: any) => ({
                        id: post.id || post._id,
                        title: post.title || post.caption || 'Untitled Post',
                        platform: post.platform?.toLowerCase() || 'instagram',
                        scheduledTime: post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Not scheduled',
                        status: (post.status || 'draft') as 'scheduled' | 'published' | 'draft'
                    }));
                    setPosts(mappedPosts);
                } else {
                    setPosts([]);
                }
            } else {
                setPosts([]);
            }
        } catch (e: any) {
            console.error("Failed to fetch content:", e);
            // Fallback to mock data if API fails
            setPosts([
                { id: "1", title: "New Product Launch", platform: "instagram", scheduledTime: "Tomorrow, 10:00 AM", status: "scheduled" },
                { id: "2", title: "Tech Review: iPhone 16", platform: "youtube", scheduledTime: "Feb 12, 4:00 PM", status: "draft" },
                { id: "3", title: "Weekly Update", platform: "instagram", scheduledTime: "Yesterday", status: "published" },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "scheduled": return "text-yellow-400";
            case "published": return "text-green-400";
            case "draft": return "text-gray-400";
            default: return "text-white";
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-900">
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-white text-2xl font-bold">Content</Text>
                    <TouchableOpacity className="bg-blue-600 px-4 py-2 rounded-lg active:bg-blue-700">
                        <Text className="text-white font-bold">+ New Post</Text>
                    </TouchableOpacity>
                </View>

                <View className="space-y-4">
                    {posts.map((post) => (
                        <TouchableOpacity key={post.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 active:bg-gray-700">
                            <View className="flex-row justify-between items-start mb-2">
                                <Text className="text-white font-bold text-lg flex-1 mr-2" numberOfLines={1}>{post.title}</Text>
                                <FontAwesome
                                    name={post.platform === "instagram" ? "instagram" : "youtube-play"}
                                    size={20}
                                    color={post.platform === "instagram" ? "#E1306C" : "#FF0000"}
                                />
                            </View>

                            <View className="flex-row justify-between items-center mt-2">
                                <Text className="text-gray-400 text-sm">{post.scheduledTime}</Text>
                                <Text className={`font-bold uppercase text-xs ${getStatusColor(post.status)}`}>{post.status}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
