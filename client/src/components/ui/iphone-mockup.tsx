import React from 'react';
import { Wifi, Battery, Signal } from 'lucide-react';
import { motion, useAnimation } from 'framer-motion';

interface IphoneMockupProps {
    children: React.ReactNode;
    className?: string;
    isAutoScroll?: boolean;
}

export const IphoneMockup: React.FC<IphoneMockupProps> = ({ children, className = '', isAutoScroll = false }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const controls = useAnimation();
    const touchControls = useAnimation();
    const isCancelledRef = React.useRef(false);

    React.useEffect(() => {
        if (!isAutoScroll) return;

        // Reset cancellation flag on mount
        isCancelledRef.current = false;

        // Cancellable delay helper
        const delay = (ms: number) => new Promise<void>((resolve) => {
            const timeoutId = setTimeout(() => {
                if (!isCancelledRef.current) resolve();
            }, ms);
            // Store timeout for potential cleanup
            return () => clearTimeout(timeoutId);
        });

        // Small delay to ensure DOM is rendered
        const timeoutId = setTimeout(async () => {
            if (!containerRef.current || !contentRef.current || isCancelledRef.current) return;

            const containerHeight = containerRef.current.offsetHeight;
            const contentHeight = contentRef.current.offsetHeight;

            // Calculate exact scroll distance needed - no extra padding
            if (contentHeight > containerHeight && !isCancelledRef.current) {
                // Only scroll exactly as much as the content overflows
                const scrollAmount = contentHeight - containerHeight;
                const scrollDuration = Math.max(2.5, scrollAmount / 100); // Natural scroll speed
                const pauseDuration = 2000; // 2 second pause at top and bottom

                // Combined animation function for perfect sync
                const runAnimationCycle = async () => {
                    while (!isCancelledRef.current) {
                        // === PAUSE AT TOP ===
                        await delay(pauseDuration);
                        if (isCancelledRef.current) break;

                        // === SCROLL DOWN with touch gesture ===
                        // Finger enters from bottom-right with elegant slide-in
                        touchControls.set({ y: 80, x: 30, opacity: 0, scale: 0.3, rotate: 15 });
                        if (isCancelledRef.current) break;

                        await touchControls.start({
                            y: 0,
                            x: 0,
                            opacity: 1,
                            scale: 1.15, // Press effect - slightly larger
                            rotate: 0,
                            transition: {
                                duration: 0.4,
                                ease: [0.34, 1.56, 0.64, 1], // Spring-like bounce
                                opacity: { duration: 0.2 }
                            }
                        });
                        if (isCancelledRef.current) break;

                        // Brief press hold with subtle pulse
                        await touchControls.start({
                            scale: 1.0,
                            transition: { duration: 0.15 }
                        });
                        if (isCancelledRef.current) break;

                        // Swipe UP gesture (finger moves up = content scrolls down)
                        const scrollDownPromise = controls.start({
                            y: -scrollAmount,
                            transition: { duration: scrollDuration, ease: [0.22, 1, 0.36, 1] }
                        });

                        const swipeUpPromise = touchControls.start({
                            y: -150,
                            scale: 0.85,
                            transition: { duration: scrollDuration * 0.5, ease: [0.22, 1, 0.36, 1] }
                        });

                        await swipeUpPromise;
                        if (isCancelledRef.current) break;

                        // Elegant exit - float up and fade
                        await touchControls.start({
                            opacity: 0,
                            scale: 0.4,
                            y: -200,
                            rotate: -10,
                            transition: { duration: 0.25, ease: "easeOut" }
                        });

                        await scrollDownPromise;
                        if (isCancelledRef.current) break;

                        // === PAUSE AT BOTTOM ===
                        await delay(pauseDuration);
                        if (isCancelledRef.current) break;

                        // === SCROLL UP with touch gesture ===
                        // Finger enters from top-right with elegant slide-in
                        touchControls.set({ y: -150, x: 30, opacity: 0, scale: 0.3, rotate: -15 });
                        if (isCancelledRef.current) break;

                        await touchControls.start({
                            y: -80,
                            x: 0,
                            opacity: 1,
                            scale: 1.15,
                            rotate: 0,
                            transition: {
                                duration: 0.4,
                                ease: [0.34, 1.56, 0.64, 1],
                                opacity: { duration: 0.2 }
                            }
                        });
                        if (isCancelledRef.current) break;

                        // Brief press hold with subtle pulse
                        await touchControls.start({
                            scale: 1.0,
                            transition: { duration: 0.15 }
                        });
                        if (isCancelledRef.current) break;

                        // Swipe DOWN gesture (finger moves down = content scrolls up)
                        const scrollUpPromise = controls.start({
                            y: 0,
                            transition: { duration: scrollDuration, ease: [0.22, 1, 0.36, 1] }
                        });

                        const swipeDownPromise = touchControls.start({
                            y: 70,
                            scale: 0.85,
                            transition: { duration: scrollDuration * 0.5, ease: [0.22, 1, 0.36, 1] }
                        });

                        await swipeDownPromise;
                        if (isCancelledRef.current) break;

                        // Elegant exit - float down and fade
                        await touchControls.start({
                            opacity: 0,
                            scale: 0.4,
                            y: 120,
                            rotate: 10,
                            transition: { duration: 0.25, ease: "easeOut" }
                        });

                        await scrollUpPromise;
                    }
                };

                runAnimationCycle();
            }
        }, 500); // Wait 500ms for content to render

        return () => {
            isCancelledRef.current = true;
            clearTimeout(timeoutId);
            controls.stop();
            touchControls.stop();
        };
    }, [isAutoScroll, controls, touchControls]);

    return (
        <div className={`relative mx-auto border-gray-900 dark:border-gray-900 bg-gray-900 border-[14px] rounded-[2.5rem] h-[600px] w-[300px] shadow-xl ${className}`}>
            {/* Physical Side Buttons */}
            <div className="h-[32px] w-[3px] bg-gray-800 absolute -left-[17px] top-[72px] rounded-l-lg"></div>
            <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[17px] top-[124px] rounded-l-lg"></div>
            <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[17px] top-[178px] rounded-l-lg"></div>
            <div className="h-[64px] w-[3px] bg-gray-800 absolute -right-[17px] top-[142px] rounded-r-lg"></div>

            {/* Screen */}
            <div className="rounded-[2rem] overflow-hidden w-full h-full bg-black relative flex flex-col">
                {/* Status Bar */}
                <div className="h-12 w-full z-20 px-6 flex items-center justify-between pt-3 select-none pointer-events-none text-white shrink-0 relative">
                    {/* Time */}
                    <span className="text-[13px] font-semibold w-8 text-center">9:41</span>

                    {/* Status Icons */}
                    <div className="flex items-center gap-1.5">
                        <Signal className="w-3.5 h-3.5 fill-current" />
                        <Wifi className="w-3.5 h-3.5" />
                        <Battery className="w-4 h-4" />
                    </div>
                </div>

                {/* Dynamic Island */}
                <div className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[85px] h-[24px] bg-black rounded-full z-50 pointer-events-none" />

                {/* Content Container */}
                <div
                    ref={containerRef}
                    className="flex-1 w-full relative bg-[#0a0a0a] overflow-hidden"
                >
                    {isAutoScroll ? (
                        <>
                            <motion.div
                                className="w-full"
                                animate={controls}
                                initial={{ y: 0 }}
                                style={{ willChange: 'transform' }}
                            >
                                <div ref={contentRef} className="overflow-y-visible">
                                    {children}
                                </div>
                            </motion.div>

                            {/* Touch Icon Simulation */}
                            <motion.div
                                className="absolute pointer-events-none z-30 flex items-center justify-center p-2"
                                animate={touchControls}
                                initial={{ opacity: 0, y: 0 }}
                                style={{ right: '20%', top: '60%', willChange: 'transform, opacity' }}
                            >
                                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg">
                                    <div className="w-6 h-6 rounded-full bg-white/50" />
                                </div>
                            </motion.div>
                        </>
                    ) : (
                        <div className="h-full overflow-y-auto no-scrollbar">
                            {children}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
