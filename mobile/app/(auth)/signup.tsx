import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

// Complete auth session
WebBrowser.maybeCompleteAuthSession();

export default function SignupScreen() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const router = useRouter();

    // Google Sign-In configuration
    // Note: For production, you'll need to create an iOS OAuth client in Google Cloud Console
    // For now, using web client ID which works with Expo Go
    const [request, response, promptAsync] = Google.useAuthRequest({
        clientId: '309418074269-8vnst4fvpl3o7pf7gmkths2qv3cn6ad1.apps.googleusercontent.com',
        iosClientId: '309418074269-8vnst4fvpl3o7pf7gmkths2qv3cn6ad1.apps.googleusercontent.com',
        webClientId: '309418074269-8vnst4fvpl3o7pf7gmkths2qv3cn6ad1.apps.googleusercontent.com',
    });

    // Handle Google Sign-In response
    useEffect(() => {
        if (response?.type === 'success') {
            handleGoogleSignInSuccess(response.params.id_token);
        }
    }, [response]);

    const handleSignup = async () => {
        if (!name || !email || !password) {
            Alert.alert("Error", "Please fill in all fields");
            return;
        }

        setLoading(true);
        try {
            // Use Firebase authentication
            const { auth, createUserWithEmailAndPassword } = await import("../../lib/firebase");
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            // Get Firebase ID token
            const token = await userCredential.user.getIdToken();

            // Create user object
            const user = {
                id: userCredential.user.uid,
                email: userCredential.user.email || email,
                name: name,
            };

            // Sign in with the token
            await signIn(token, user);

            Alert.alert("Success", "Account created successfully!");

        } catch (error: any) {
            console.error("Signup Error:", error);
            let errorMessage = "Registration failed";

            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "Email already in use";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Password should be at least 6 characters";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Invalid email address";
            }

            Alert.alert("Signup Failed", errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignInSuccess = async (idToken: string) => {
        setLoading(true);
        try {
            const { auth, GoogleAuthProvider, signInWithCredential } = await import("../../lib/firebase");

            // Create Firebase credential
            const credential = GoogleAuthProvider.credential(idToken);

            // Sign in to Firebase
            const userCredential = await signInWithCredential(auth, credential);

            // Get Firebase ID token
            const token = await userCredential.user.getIdToken();

            // Create user object
            const user = {
                id: userCredential.user.uid,
                email: userCredential.user.email || '',
                name: userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User',
            };

            // Sign in with the token
            await signIn(token, user);
        } catch (error: any) {
            console.error("Google Sign-In Error:", error);
            Alert.alert("Error", "Failed to sign in with Google");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = () => {
        promptAsync();
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-900 px-6 justify-center">
            <View className="mb-8">
                <TextInput style={{ display: "none" }} />
                <Text className="text-3xl font-bold text-white mb-2">Create Account</Text>
                <Text className="text-gray-400">Join VeeFore today</Text>
            </View>

            <View className="space-y-4">
                <View>
                    <Text className="text-gray-300 mb-1 ml-1">Full Name</Text>
                    <TextInput
                        className="w-full bg-gray-800 text-white p-4 rounded-xl border border-gray-700 focus:border-blue-500"
                        placeholder="John Doe"
                        placeholderTextColor="#6b7280"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                    />
                </View>

                <View>
                    <Text className="text-gray-300 mb-1 ml-1">Email</Text>
                    <TextInput
                        className="w-full bg-gray-800 text-white p-4 rounded-xl border border-gray-700 focus:border-blue-500"
                        placeholder="email@example.com"
                        placeholderTextColor="#6b7280"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />
                </View>

                <View>
                    <Text className="text-gray-300 mb-1 ml-1">Password</Text>
                    <TextInput
                        className="w-full bg-gray-800 text-white p-4 rounded-xl border border-gray-700 focus:border-blue-500"
                        placeholder="••••••••"
                        placeholderTextColor="#6b7280"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>

                <TouchableOpacity
                    className="w-full bg-blue-600 p-4 rounded-xl items-center mt-4 active:bg-blue-700"
                    onPress={handleSignup}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text className="text-white font-bold text-lg">Sign Up</Text>
                    )}
                </TouchableOpacity>

                {/* Divider */}
                <View className="flex-row items-center my-6">
                    <View className="flex-1 h-px bg-gray-700" />
                    <Text className="text-gray-400 mx-4">OR</Text>
                    <View className="flex-1 h-px bg-gray-700" />
                </View>

                {/* Google Sign-In Button */}
                <TouchableOpacity
                    className="w-full bg-white p-4 rounded-xl items-center flex-row justify-center active:bg-gray-100"
                    onPress={handleGoogleSignIn}
                    disabled={loading}
                >
                    <Text className="text-gray-900 font-bold text-lg">Continue with Google</Text>
                </TouchableOpacity>

                <View className="flex-row justify-center mt-4">
                    <Text className="text-gray-400">Already have an account? </Text>
                    <Link href="/(auth)/login" asChild>
                        <TouchableOpacity>
                            <Text className="text-blue-400 font-bold">Log In</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </SafeAreaView>
    );
}
