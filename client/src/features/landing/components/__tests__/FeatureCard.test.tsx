import { describe, it, expect } from 'vitest';
import { colorMap } from '../FeatureCard';
import type { Feature, ColorKey } from '../FeatureCard';
import { Search, MessageSquare, DollarSign, Calendar } from 'lucide-react';

describe('FeatureCard', () => {
    const mockAnalysisFeature: Feature = {
        title: "Test Analysis Feature",
        description: "Test description for analysis",
        highlight: "Test Highlight",
        icon: Search,
        color: "blue",
        screen: {
            type: "analysis",
            title: "Video Breakdown",
            stats: [
                { label: "Pacing Speed", value: "Fast (1.2s cuts)", color: "text-blue-400" },
                { label: "Opening Hook", value: "\"Negative Statement\"", color: "text-rose-400" }
            ],
            points: ["Visual hook at 0:02", "Text overlay matches speech", "Call-to-action at 80% mark"]
        }
    };

    const mockChatFeature: Feature = {
        title: "Test Chat Feature",
        description: "Test description for chat",
        highlight: "Chat Active",
        icon: MessageSquare,
        color: "purple",
        screen: {
            type: "chat",
            messages: [
                { user: "fan", text: "Test message from fan", time: "2m" },
                { user: "me", text: "Test reply", time: "Just now" }
            ]
        }
    };

    const mockSalesFeature: Feature = {
        title: "Test Sales Feature",
        description: "Test description for sales",
        highlight: "Sales Active",
        icon: DollarSign,
        color: "green",
        screen: {
            type: "sales",
            title: "Product Delivery",
            steps: [
                { text: "Follower commented 'PRESET'", status: "complete" },
                { text: "Verified they follow you", status: "complete" },
                { text: "Sent Lightroom Preset link via DM", status: "active" }
            ]
        }
    };

    const mockCalendarFeature: Feature = {
        title: "Test Calendar Feature",
        description: "Test description for calendar",
        highlight: "Calendar Active",
        icon: Calendar,
        color: "purple",
        screen: {
            type: "calendar",
            title: "Content Calendar",
            schedule: {
                date: "Tuesday, Oct 12",
                time: "9:00 AM",
                postTitle: "My new video hook...",
                peak: true
            }
        }
    };

    describe('colorMap', () => {
        it('contains all required color configurations', () => {
            expect(colorMap).toHaveProperty('blue');
            expect(colorMap).toHaveProperty('purple');
            expect(colorMap).toHaveProperty('green');
        });

        it('each color has all required properties', () => {
            const requiredProps = [
                'bg', 'bgLight', 'border', 'text', 'badgeBg', 'gradient',
                'orbPrimary', 'orbSecondary', 'panelGradient', 'borderColor', 'boxShadow'
            ];

            Object.values(colorMap).forEach(color => {
                requiredProps.forEach(prop => {
                    expect(color).toHaveProperty(prop);
                });
            });
        });

        it('blue color has correct CSS classes', () => {
            expect(colorMap.blue.bg).toBe('bg-blue-500/20');
            expect(colorMap.blue.text).toBe('text-blue-400');
            expect(colorMap.blue.border).toBe('border-blue-500/20');
        });

        it('purple color has correct CSS classes', () => {
            expect(colorMap.purple.bg).toBe('bg-purple-500/20');
            expect(colorMap.purple.text).toBe('text-purple-400');
            expect(colorMap.purple.border).toBe('border-purple-500/20');
        });

        it('green color has correct CSS classes', () => {
            expect(colorMap.green.bg).toBe('bg-green-500/20');
            expect(colorMap.green.text).toBe('text-green-400');
            expect(colorMap.green.border).toBe('border-green-500/20');
        });
    });

    describe('Feature interface validation', () => {
        it('creates valid analysis feature data structure', () => {
            const validFeature: Feature = {
                title: "Valid Feature",
                description: "Valid description",
                highlight: "Valid highlight",
                icon: Search,
                color: "blue",
                screen: {
                    type: "analysis",
                    title: "Test",
                    stats: [],
                    points: []
                }
            };

            expect(validFeature.title).toBe("Valid Feature");
            expect(validFeature.color).toBe("blue");
            expect(validFeature.screen.type).toBe("analysis");
        });

        it('creates valid chat feature data structure', () => {
            const validFeature: Feature = {
                title: "Chat Feature",
                description: "Chat description",
                highlight: "Chat highlight",
                icon: MessageSquare,
                color: "purple",
                screen: {
                    type: "chat",
                    messages: []
                }
            };

            expect(validFeature.screen.type).toBe("chat");
            expect(validFeature.color).toBe("purple");
        });

        it('creates valid sales feature data structure', () => {
            const validFeature: Feature = {
                title: "Sales Feature",
                description: "Sales description",
                highlight: "Sales highlight",
                icon: DollarSign,
                color: "green",
                screen: {
                    type: "sales",
                    title: "Pipeline",
                    steps: []
                }
            };

            expect(validFeature.screen.type).toBe("sales");
            expect(validFeature.color).toBe("green");
        });

        it('creates valid calendar feature data structure', () => {
            const validFeature: Feature = {
                title: "Calendar Feature",
                description: "Calendar description",
                highlight: "Calendar highlight",
                icon: Calendar,
                color: "purple",
                screen: {
                    type: "calendar",
                    title: "Schedule",
                    schedule: {
                        date: "Monday",
                        time: "10:00 AM",
                        postTitle: "Test Post",
                        peak: true
                    }
                }
            };

            expect(validFeature.screen.type).toBe("calendar");
            expect(validFeature.screen.schedule).toBeDefined();
            expect(validFeature.screen.schedule?.peak).toBe(true);
        });

        it('supports all color keys', () => {
            const colors: ColorKey[] = ['blue', 'purple', 'green'];
            
            colors.forEach(color => {
                const feature: Feature = {
                    title: `${color} feature`,
                    description: "desc",
                    highlight: "highlight",
                    icon: Search,
                    color: color,
                    screen: { type: "analysis" }
                };
                
                expect(feature.color).toBe(color);
                expect(colorMap[color]).toBeDefined();
            });
        });
    });

    describe('Data structure validation', () => {
        it('validates analysis screen has required fields', () => {
            expect(mockAnalysisFeature.screen.type).toBe('analysis');
            expect(mockAnalysisFeature.screen.stats).toBeDefined();
            expect(mockAnalysisFeature.screen.points).toBeDefined();
            expect(mockAnalysisFeature.screen.stats?.length).toBeGreaterThan(0);
        });

        it('validates chat screen has required fields', () => {
            expect(mockChatFeature.screen.type).toBe('chat');
            expect(mockChatFeature.screen.messages).toBeDefined();
            expect(mockChatFeature.screen.messages?.length).toBeGreaterThan(0);
        });

        it('validates sales screen has required fields', () => {
            expect(mockSalesFeature.screen.type).toBe('sales');
            expect(mockSalesFeature.screen.steps).toBeDefined();
            expect(mockSalesFeature.screen.steps?.length).toBeGreaterThan(0);
        });

        it('validates calendar screen has required fields', () => {
            expect(mockCalendarFeature.screen.type).toBe('calendar');
            expect(mockCalendarFeature.screen.schedule).toBeDefined();
            expect(mockCalendarFeature.screen.schedule?.date).toBeDefined();
            expect(mockCalendarFeature.screen.schedule?.time).toBeDefined();
        });

        it('validates feature has all required top-level fields', () => {
            expect(mockAnalysisFeature.title).toBeDefined();
            expect(mockAnalysisFeature.description).toBeDefined();
            expect(mockAnalysisFeature.highlight).toBeDefined();
            expect(mockAnalysisFeature.icon).toBeDefined();
            expect(mockAnalysisFeature.color).toBeDefined();
            expect(mockAnalysisFeature.screen).toBeDefined();
        });

        it('validates analysis stats structure', () => {
            const stats = mockAnalysisFeature.screen.stats!;
            stats.forEach(stat => {
                expect(stat.label).toBeDefined();
                expect(stat.value).toBeDefined();
                expect(stat.color).toBeDefined();
            });
        });

        it('validates chat messages structure', () => {
            const messages = mockChatFeature.screen.messages!;
            messages.forEach(msg => {
                expect(msg.user).toBeDefined();
                expect(msg.text).toBeDefined();
                expect(msg.time).toBeDefined();
            });
        });

        it('validates sales steps structure', () => {
            const steps = mockSalesFeature.screen.steps!;
            steps.forEach(step => {
                expect(step.text).toBeDefined();
                expect(step.status).toBeDefined();
                expect(['complete', 'active']).toContain(step.status);
            });
        });
    });
});
