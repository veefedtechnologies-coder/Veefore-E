import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useRouter, useSegments } from "expo-router";
import api from "../lib/api";

type AuthType = {
    user: any | null;
    isLoading: boolean;
    signIn: (token: string, userData: any) => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthType>({
    user: null,
    isLoading: true,
    signIn: async () => { },
    signOut: async () => { },
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const segments = useSegments();

    useEffect(() => {
        const loadUser = async () => {
            try {
                const token = await SecureStore.getItemAsync("token");
                const userData = await SecureStore.getItemAsync("user");

                if (token && userData) {
                    // Validate token or just trust storage until API call fails
                    setUser(JSON.parse(userData));
                    // Optional: Verify token with backend here
                }
            } catch (e) {
                console.error("Failed to load auth state", e);
            } finally {
                setIsLoading(false);
            }
        };

        loadUser();
    }, []);

    const signIn = async (token: string, userData: any) => {
        try {
            await SecureStore.setItemAsync("token", token);
            await SecureStore.setItemAsync("user", JSON.stringify(userData));
            setUser(userData);
            router.replace("/(app)/(tabs)/dashboard");
        } catch (e) {
            console.error("Sign in error", e);
        }
    };

    const signOut = async () => {
        try {
            await SecureStore.deleteItemAsync("token");
            await SecureStore.deleteItemAsync("user");
            setUser(null);
            router.replace("/");
        } catch (e) {
            console.error("Sign out error", e);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
