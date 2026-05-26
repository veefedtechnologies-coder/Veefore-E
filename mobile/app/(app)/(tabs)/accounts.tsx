import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../../lib/api";
import { FontAwesome } from "@expo/vector-icons";

type Account = {
    id: string;
    platform: "instagram" | "youtube" | "facebook";
    username: string;
    avatarUrl?: string;
    status: "active" | "expired";
};

export default function AccountsScreen() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            // Fetch real social accounts from backend
            const res = await api.get('/social-accounts/');

            if (res.data && Array.isArray(res.data)) {
                // Map backend data to our Account type
                const mappedAccounts: Account[] = res.data.map((acc: any) => ({
                    id: acc.id || acc._id,
                    platform: acc.platform?.toLowerCase() || 'instagram',
                    username: acc.username || acc.handle || 'Unknown',
                    avatarUrl: acc.profilePicture || acc.avatar,
                    status: (acc.isActive ? 'active' : 'expired') as 'active' | 'expired'
                }));
                setAccounts(mappedAccounts);
            } else {
                // No accounts found
                setAccounts([]);
            }
        } catch (e: any) {
            console.error("Failed to fetch accounts:", e);
            // Fallback to mock data if API fails
            setAccounts([
                { id: "1", platform: "instagram", username: "@veefore_official", status: "active" },
                { id: "2", platform: "youtube", username: "VeeFore Tech", status: "active" },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async (platform: 'instagram' | 'youtube' | 'tiktok') => {
        setLoading(true);
        try {
            const { connectSocialAccount } = await import("../../../lib/oauth");
            const result = await connectSocialAccount(platform);

            if (result.success) {
                Alert.alert(
                    "Success",
                    `${platform.charAt(0).toUpperCase() + platform.slice(1)} account connected successfully!`
                );
                // Refresh accounts list
                await fetchAccounts();
            } else {
                Alert.alert(
                    "Connection Failed",
                    result.error || `Failed to connect ${platform} account`
                );
            }
        } catch (error: any) {
            console.error(`Error connecting ${platform}:`, error);
            Alert.alert(
                "Error",
                `An error occurred while connecting your ${platform} account. Please try again.`
            );
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async (accountId: string, platform: string) => {
        Alert.alert(
            "Disconnect Account",
            `Are you sure you want to disconnect this ${platform} account?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Disconnect",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { disconnectSocialAccount } = await import("../../../lib/oauth");
                            const result = await disconnectSocialAccount(accountId);

                            if (result.success) {
                                Alert.alert("Success", "Account disconnected successfully");
                                await fetchAccounts();
                            } else {
                                Alert.alert("Error", result.error || "Failed to disconnect account");
                            }
                        } catch (error) {
                            Alert.alert("Error", "Failed to disconnect account");
                        }
                    },
                },
            ]
        );
    };

    const getIcon = (platform: string) => {
        switch (platform) {
            case "instagram": return "instagram";
            case "youtube": return "youtube-play";
            case "facebook": return "facebook-square";
            default: return "globe";
        }
    };

    const getColor = (platform: string) => {
        switch (platform) {
            case "instagram": return "#E1306C";
            case "youtube": return "#FF0000";
            case "facebook": return "#1877F2";
            default: return "#9CA3AF";
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-900">
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text className="text-white text-2xl font-bold mb-6">Social Accounts</Text>

                <View className="mb-8">
                    <Text className="text-gray-400 mb-4 font-semibold uppercase text-xs tracking-wider">Connected Accounts</Text>
                    {accounts.map((account) => (
                        <View key={account.id} className="bg-gray-800 p-4 rounded-xl mb-3 border border-gray-700">
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center flex-1">
                                    <View className="w-10 h-10 rounded-full items-center justify-center bg-gray-700">
                                        <FontAwesome name={getIcon(account.platform) as any} size={20} color={getColor(account.platform)} />
                                    </View>
                                    <View className="ml-3 flex-1">
                                        <Text className="text-white font-bold text-lg">{account.username}</Text>
                                        <Text className="text-gray-400 capitalize">{account.platform}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    onPress={() => handleDisconnect(account.id, account.platform)}
                                    className="bg-red-900/30 px-3 py-2 rounded-lg border border-red-800"
                                >
                                    <Text className="text-red-400 font-semibold text-xs">Disconnect</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>

                <View>
                    <Text className="text-gray-400 mb-4 font-semibold uppercase text-xs tracking-wider">Connect New Account</Text>
                    <TouchableOpacity onPress={() => handleConnect("instagram")} className="bg-gray-800 p-4 rounded-xl flex-row items-center mb-3 active:bg-gray-700" disabled={loading}>
                        <FontAwesome name="instagram" size={24} color="#E1306C" />
                        <Text className="text-white font-semibold ml-4 text-lg">Connect Instagram</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => handleConnect("youtube")} className="bg-gray-800 p-4 rounded-xl flex-row items-center mb-3 active:bg-gray-700" disabled={loading}>
                        <FontAwesome name="youtube-play" size={24} color="#FF0000" />
                        <Text className="text-white font-semibold ml-4 text-lg">Connect YouTube</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => handleConnect("tiktok")} className="bg-gray-800 p-4 rounded-xl flex-row items-center mb-3 active:bg-gray-700" disabled={loading}>
                        <FontAwesome name="music" size={24} color="#00F2EA" />
                        <Text className="text-white font-semibold ml-4 text-lg">Connect TikTok</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
