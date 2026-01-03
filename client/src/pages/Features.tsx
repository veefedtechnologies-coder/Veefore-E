import React from 'react';
import Helmet from 'react-helmet';

import {
    HeroSection,
    VeeGPTSection,
    AIEngagementSection,
    AutomationSection,
    AnalyticsSection,
    SchedulingSection,
    GrowthLoopsSection,
    DashboardSection,
    CTASection,
    GradientOrb
} from '../components/features';

const Features = () => {
    return (
        <div className="min-h-screen w-full overflow-x-hidden bg-black text-white selection:bg-blue-500/30">
            <Helmet>
                <title>Features | Veefore - AI Growth Platform</title>
                <meta name="description" content="Discover the powerful features of Veefore. From AI-driven engagement to automated workflows and deep analytics, see how Veefore helps you grow faster." />
            </Helmet>



            {/* Ambient Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <GradientOrb
                    className="top-[-10%] left-[-10%] w-[500px] h-[500px] md:w-[800px] md:h-[800px] opacity-20"
                    gradient="radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(0,0,0,0) 70%)"
                />
                <GradientOrb
                    className="bottom-[-10%] right-[-10%] w-[500px] h-[500px] md:w-[800px] md:h-[800px] opacity-20"
                    gradient="radial-gradient(circle, rgba(147,51,234,0.3) 0%, rgba(0,0,0,0) 70%)"
                />
                {/* Mid-page orbs */}
                <GradientOrb
                    className="top-[40%] right-[-20%] w-[600px] h-[600px] opacity-10"
                    gradient="radial-gradient(circle, rgba(236,72,153,0.3) 0%, rgba(0,0,0,0) 70%)"
                />
            </div>

            <main className="relative z-10 space-y-0">
                <HeroSection />
                <VeeGPTSection />
                <AIEngagementSection />
                <AutomationSection />
                <AnalyticsSection />
                <SchedulingSection />
                <GrowthLoopsSection />
                <DashboardSection />
                <CTASection />
            </main>


        </div>
    );
};

export default Features;
