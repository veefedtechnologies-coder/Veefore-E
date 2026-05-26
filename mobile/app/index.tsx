import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LandingPage() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>VeeFore</Text>
                <Text style={styles.subtitle}>
                    AI-Powered Social Media Management
                </Text>
            </View>

            <View style={styles.buttonContainer}>
                <Link href="/(auth)/login" asChild>
                    <TouchableOpacity style={styles.loginButton}>
                        <Text style={styles.loginButtonText}>Log In</Text>
                    </TouchableOpacity>
                </Link>

                <Link href="/(auth)/signup" asChild>
                    <TouchableOpacity style={styles.signupButton}>
                        <Text style={styles.signupButtonText}>Sign Up</Text>
                    </TouchableOpacity>
                </Link>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    content: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 48,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 18,
        color: '#9CA3AF',
        textAlign: 'center',
    },
    buttonContainer: {
        width: '100%',
    },
    loginButton: {
        width: '100%',
        backgroundColor: '#2563EB',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 16,
    },
    loginButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 18,
    },
    signupButton: {
        width: '100%',
        borderWidth: 1,
        borderColor: '#374151',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    signupButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 18,
    },
});
