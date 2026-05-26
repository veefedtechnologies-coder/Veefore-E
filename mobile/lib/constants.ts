import Constants from "expo-constants";
import { Platform } from "react-native";

// Helper to get local IP based on environment
const getLocalHost = () => {
    if (Platform.OS === "android") {
        return "10.0.2.2";
    }
    return "localhost";
};

// Replace with your machine's LAN IP for physical device testing
export const API_URL = `http://${getLocalHost()}:3000/api`;
