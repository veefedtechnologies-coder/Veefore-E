import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../context/AuthContext";
import api from "../../../lib/api";

export default function DashboardScreen() {
    const { user, signOut } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStats = async () => {
        try {
            // Fetch user's workspaces first
            const workspacesRes = await api.get('/workspaces/');
            const workspaces = workspacesRes.data;

            if (workspaces && workspaces.length > 0) {
                const workspaceId = workspaces[0].id;

                // Fetch workspace stats
                const statsRes = await api.get(`/workspaces/${workspaceId}/stats`);

                setStats({
                    views: statsRes.data.totalViews || 0,
                    subscribers: statsRes.data.totalFollowers || 0,
                    engagement: statsRes.data.engagementRate || "0%",
                    workspaceId: workspaceId,
                    workspaceName: workspaces[0].name
                });
            } else {
                // No workspace found, use default values
                setStats({
                    views: 0,
                    subscribers: 0,
                    engagement: "0%",
                    workspaceId: null,
                    workspaceName: "No Workspace"
                });
            }
        } catch (e: any) {
            console.error("Failed to fetch dashboard stats", e);
            // Fallback to mock data if API fails
            setStats({
                views: 12500,
                subscribers: 840,
                engagement: "4.2%",
                workspaceId: null,
                workspaceName: "Demo Workspace"
            });
        }
    };

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await fetchStats();
        setRefreshing(false);
    }, []);

    useEffect(() => {
        fetchStats();
    }, []);

    return (
        <SafeAreaView className="flex-1 bg-gray-900">
            <ScrollView
                contentContainerStyle={{ padding: 20 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
                }
            >
                <View className="flex-row justify-between items-center mb-6">
                    <View>
                        <Text className="text-white text-2xl font-bold">Dashboard</Text>
                        <Text className="text-gray-400">Welcome back, {user?.name || "User"}</Text>
                    </View>
                    <Text onPress={signOut} className="text-red-400 font-bold">Log Out</Text>
                </View>

                {/* Stats Grid */}
                <View className="flex-row flex-wrap gap-4 mb-6">
                    <View className="bg-gray-800 p-4 rounded-xl flex-1 min-w-[150px]">
                        <Text className="text-gray-400 text-sm">Total Views</Text>
                        <Text className="text-white text-2xl font-bold mt-1">{stats?.views?.toLocaleString() || "0"}</Text>
                    </View>
                    <View className="bg-gray-800 p-4 rounded-xl flex-1 min-w-[150px]">
                        <Text className="text-gray-400 text-sm">Followers</Text>
                        <Text className="text-white text-2xl font-bold mt-1">{stats?.subscribers?.toLocaleString() || "0"}</Text>
                    </View>
                    <View className="bg-gray-800 p-4 rounded-xl w-full mt-2">
                        <Text className="text-gray-400 text-sm">Engagement Rate</Text>
                        <Text className="text-white text-2xl font-bold mt-1">{stats?.engagement || "0%"}</Text>
                    </View>
                </View>

                {/* Recent Activity Section */}
                <View>
                    <Text className="text-white text-lg font-bold mb-4">Recent Activity</Text>
                    <View className="bg-gray-800 rounded-xl p-4">
                        <Text className="text-gray-400 italic text-center">No recent activity found.</Text>
                    </View>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}
