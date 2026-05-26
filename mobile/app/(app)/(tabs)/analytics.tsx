import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LineChart, BarChart } from "react-native-chart-kit";
import api from "../../../lib/api";

const screenWidth = Dimensions.get("window").width;

export default function AnalyticsScreen() {
    const [loading, setLoading] = useState(true);
    const [analyticsData, setAnalyticsData] = useState<any>(null);

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            // Fetch user's workspaces first
            const workspacesRes = await api.get('/workspaces/');
            const workspaces = workspacesRes.data;

            if (workspaces && workspaces.length > 0) {
                const workspaceId = workspaces[0].id;

                // Fetch analytics performance summary
                const res = await api.get(`/analytics/workspace/${workspaceId}/performance-summary`);
                setAnalyticsData(res.data);
            }
        } catch (e: any) {
            console.error("Failed to fetch analytics:", e);
            // Use mock data if API fails
            setAnalyticsData(null);
        } finally {
            setLoading(false);
        }
    };

    // Chart configuration
    const chartConfig = {
        backgroundColor: "#1f2937",
        backgroundGradientFrom: "#1f2937",
        backgroundGradientTo: "#111827",
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(156, 163, 175, ${opacity})`,
        style: {
            borderRadius: 16,
        },
        propsForDots: {
            r: "4",
            strokeWidth: "2",
            stroke: "#3b82f6",
        },
    };

    // Sample data for charts (replace with real data from API)
    const lineChartData = {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [
            {
                data: analyticsData?.weeklyViews || [120, 145, 180, 165, 200, 190, 220],
                color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                strokeWidth: 2,
            },
        ],
    };

    const barChartData = {
        labels: ["IG", "YT", "TT", "FB"],
        datasets: [
            {
                data: analyticsData?.platformEngagement || [85, 92, 78, 65],
            },
        ],
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-900">
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text className="text-white text-2xl font-bold mb-6">Analytics</Text>

                {/* Weekly Views Chart */}
                <View className="mb-6">
                    <Text className="text-white text-lg font-semibold mb-3">Weekly Views</Text>
                    <LineChart
                        data={lineChartData}
                        width={screenWidth - 40}
                        height={220}
                        chartConfig={chartConfig}
                        bezier
                        style={{
                            borderRadius: 16,
                        }}
                    />
                </View>

                {/* Platform Engagement Chart */}
                <View className="mb-6">
                    <Text className="text-white text-lg font-semibold mb-3">Platform Engagement</Text>
                    <BarChart
                        data={barChartData}
                        width={screenWidth - 40}
                        height={220}
                        chartConfig={chartConfig}
                        yAxisLabel=""
                        yAxisSuffix="%"
                        style={{
                            borderRadius: 16,
                        }}
                    />
                </View>

                {/* Stats Grid */}
                <View className="flex-row justify-between mb-4">
                    <View className="bg-gray-800 p-4 rounded-xl flex-1 mr-2">
                        <Text className="text-gray-400 text-xs">Impressions</Text>
                        <Text className="text-white text-xl font-bold">
                            {analyticsData?.totalImpressions?.toLocaleString() || "45.2K"}
                        </Text>
                        <Text className="text-green-400 text-xs mt-1">+12%</Text>
                    </View>
                    <View className="bg-gray-800 p-4 rounded-xl flex-1 ml-2">
                        <Text className="text-gray-400 text-xs">Clicks</Text>
                        <Text className="text-white text-xl font-bold">
                            {analyticsData?.totalClicks?.toLocaleString() || "1,204"}
                        </Text>
                        <Text className="text-green-400 text-xs mt-1">+5%</Text>
                    </View>
                </View>

                <View className="flex-row justify-between">
                    <View className="bg-gray-800 p-4 rounded-xl flex-1 mr-2">
                        <Text className="text-gray-400 text-xs">Engagement Rate</Text>
                        <Text className="text-white text-xl font-bold">
                            {analyticsData?.engagementRate || "4.2%"}
                        </Text>
                        <Text className="text-green-400 text-xs mt-1">+2.1%</Text>
                    </View>
                    <View className="bg-gray-800 p-4 rounded-xl flex-1 ml-2">
                        <Text className="text-gray-400 text-xs">Reach</Text>
                        <Text className="text-white text-xl font-bold">
                            {analyticsData?.totalReach?.toLocaleString() || "32.8K"}
                        </Text>
                        <Text className="text-green-400 text-xs mt-1">+8%</Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
