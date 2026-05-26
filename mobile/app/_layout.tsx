import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../context/AuthContext";
import "../global.css";

export default function RootLayout() {
    return (
        <AuthProvider>
            <Slot />
            <StatusBar style="auto" />
        </AuthProvider>
    );
}
