import { Tabs } from "expo-router";
import { useColorScheme } from "react-native";
// Lucide icons would be ideal, but for simplicity/reliability without complex linking, standard Expo icons for now
// or simple text if icons fail install. I'll rely on text for safety or basic unicode/vector icons if simple.
// Actually, @expo/vector-icons comes pre-installed usually.
import { FontAwesome } from "@expo/vector-icons";

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: "#1f2937", // gray-800
                    borderTopColor: "#374151", // gray-700
                },
                tabBarActiveTintColor: "#3b82f6", // blue-500
                tabBarInactiveTintColor: "#9ca3af", // gray-400
            }}
        >
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: "Dashboard",
                    tabBarIcon: ({ color }) => <FontAwesome name="dashboard" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="content"
                options={{
                    title: "Content",
                    tabBarIcon: ({ color }) => <FontAwesome name="calendar" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="copilot"
                options={{
                    title: "Copilot",
                    tabBarIcon: ({ color }) => <FontAwesome name="magic" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="analytics"
                options={{
                    title: "Anschutz",
                    tabBarIcon: ({ color }) => <FontAwesome name="bar-chart" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="accounts"
                options={{
                    title: "Accounts",
                    tabBarIcon: ({ color }) => <FontAwesome name="users" size={24} color={color} />,
                }}
            />
        </Tabs>
    );
}
