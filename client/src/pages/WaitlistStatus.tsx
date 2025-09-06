import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { 
  Crown, Clock, Gift, Share2, Copy, Check, Users, TrendingUp, 
  Star, Calendar, Mail, Trophy, Zap, BarChart3, 
  Globe, BookOpen, MessageSquare, HeartHandshake, 
  Gem, ArrowLeft, Rocket, Shield, Bell, Settings, 
  Download, Target, ChevronRight, Activity, Briefcase, Award
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface WaitlistUser {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  referredBy?: string;
  referralCount: number;
  credits: number;
  status: string;
  joinedAt: string;
  position?: number;
  metadata?: {
    questionnaire?: any;
  };
}

// Innovative floating elements for light theme
const FloatingElements = () => {
  const elements = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    size: Math.random() * 60 + 20,
    delay: Math.random() * 5,
    duration: Math.random() * 10 + 15,
    x: Math.random() * 100,
    y: Math.random() * 100,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {elements.map((element) => (
        <motion.div
          key={element.id}
          className="absolute"
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
          }}
          animate={{
            y: [0, -50, 0],
            rotate: [0, 180, 360],
            scale: [0.8, 1.2, 0.8],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: element.duration,
            delay: element.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div 
            className="bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl blur-sm"
            style={{
              width: element.size,
              height: element.size,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
};

// Creative progress visualization
const CreativeProgress = ({ value, label }: { value: number; label: string }) => {
  return (
    <div className="relative">
      <div className="text-sm font-medium text-gray-600 mb-3">{label}</div>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full"
        />
        <motion.div
          animate={{ x: ["0%", "100%", "0%"] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-y-0 left-0 w-8 bg-white/40 rounded-full blur-sm"
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>Started</span>
        <span className="font-semibold text-blue-600">{value}% Complete</span>
      </div>
    </div>
  );
};

const WaitlistStatus = () => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<WaitlistUser | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(true);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [stats] = useState({
    totalUsers: 1247,
    avgWaitTime: '2-3 weeks',
    launchProgress: 78
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [notifications] = useState([
    { id: 1, type: 'info', message: 'Beta testing phase has begun!', time: '2 hours ago', read: false },
    { id: 2, type: 'success', message: 'Your position moved up by 15 spots', time: '1 day ago', read: false },
    { id: 3, type: 'update', message: 'New feature preview available', time: '3 days ago', read: true }
  ]);
  const [milestones] = useState([
    { id: 1, title: 'Account Created', description: 'Successfully joined the waitlist', completed: true, date: user?.joinedAt },
    { id: 2, title: 'Email Verified', description: 'Email verification completed', completed: true, date: user?.joinedAt },
    { id: 3, title: 'Profile Setup', description: 'Complete your profile information', completed: true, date: user?.joinedAt },
    { id: 4, title: 'Beta Access', description: 'Receive beta testing invitation', completed: false, date: null },
    { id: 5, title: 'Full Access', description: 'Get complete platform access', completed: false, date: null }
  ]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('user');
    
    if (userId) {
      fetchUserData(userId);
    } else {
      setLocation('/waitlist');
    }
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const response = await fetch(`/api/early-access/status/user/${userId}`);
      const data = await response.json();
      
      if (data.success) {
        setUser(data.user);
        setTimeout(() => setShowSuccessModal(false), 3000);
      } else {
        toast({
          title: "Error",
          description: "Could not load your waitlist status.",
          variant: "destructive",
        });
        setLocation('/waitlist');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setLocation('/waitlist');
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = async () => {
    if (!user?.referralCode) return;
    
    try {
      await navigator.clipboard.writeText(`https://veefore.com/waitlist?ref=${user.referralCode}`);
      setCopiedReferral(true);
      toast({
        title: "Referral link copied!",
        description: "Share it with friends to skip ahead in line.",
      });
      setTimeout(() => setCopiedReferral(false), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <motion.div className="relative">
          <motion.div
            animate={{ 
              rotate: 360,
              scale: [1, 1.1, 1],
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full"
          />
          <motion.div
            animate={{ 
              rotate: -360,
              scale: [1.1, 1, 1.1],
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute inset-2 w-12 h-12 border-2 border-purple-200 border-b-purple-500 rounded-full"
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 relative">
      <FloatingElements />

      {/* Header */}
      <div className="relative z-10 bg-white/80 backdrop-blur-md border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <img 
                  src="/veefore-logo.png" 
                  alt="VeeFore" 
                  className="h-12 w-auto"
                />
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  VeeFore
                </h1>
                <p className="text-sm text-gray-600">Waitlist Status Dashboard</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Badge className="bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 px-4 py-2 text-sm font-medium border border-green-200 shadow-sm">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-2 h-2 bg-green-500 rounded-full mr-2"
                  />
                  {user?.status === 'approved' ? 'Approved' : 'Waitlisted'}
                </Badge>
              </motion.div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/')}
                className="text-gray-600 border-gray-300 hover:bg-gray-50 hover:shadow-sm transition-all"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Enhanced Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
            <DialogContent className="max-w-2xl mx-auto bg-white border-0 shadow-2xl rounded-3xl">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ duration: 0.6, ease: "backOut" }}
                className="text-center py-12"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ 
                    delay: 0.2, 
                    type: "spring", 
                    stiffness: 200,
                    damping: 15 
                  }}
                  className="relative w-24 h-24 mx-auto mb-8"
                >
                  <div className="w-24 h-24 bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-xl">
                    <Trophy className="w-12 h-12 text-white" />
                  </div>
                  <motion.div
                    animate={{ 
                      scale: [1, 1.3, 1],
                      opacity: [0.8, 0.4, 0.8]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-600 rounded-full blur-md -z-10"
                  />
                </motion.div>
                
                <DialogHeader>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <DialogTitle className="text-3xl font-bold text-gray-900 mb-4">
                      🎉 You're In! Welcome to VeeFore
                    </DialogTitle>
                    <DialogDescription className="text-gray-600 text-lg leading-relaxed max-w-lg mx-auto">
                      Congratulations! You've secured your spot in the future of AI-powered social media management. 
                      Get ready for an incredible journey ahead.
                    </DialogDescription>
                  </motion.div>
                </DialogHeader>
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-100"
                >
                  <p className="text-sm text-gray-700 mb-4">
                    🚀 <strong>What's Next?</strong> We'll notify you as soon as your access is ready. 
                    In the meantime, explore your personalized dashboard below!
                  </p>
                  <Button
                    onClick={() => setShowSuccessModal(false)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-2 rounded-xl hover:shadow-lg transition-all"
                  >
                    Explore Dashboard
                  </Button>
                </motion.div>
              </motion.div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>



      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Innovative Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-12"
        >
          <div className="relative overflow-hidden bg-white rounded-3xl shadow-2xl border border-gray-100">
            {/* Decorative background pattern */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-100/40 to-transparent rounded-full -mr-48 -mt-48" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-100/40 to-transparent rounded-full -ml-32 -mb-32" />
            
            <div className="relative z-10 p-12">
              {user?.status === 'approved' || user?.status === 'early_access' ? (
                // Congratulations Section for Approved/Early Access Users
                <>
                  <motion.div
                    initial={{ scale: 0, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                    className="inline-flex items-center space-x-3 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full px-8 py-4 mb-8 border border-green-200/80 shadow-xl"
                  >
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    >
                      <Trophy className="w-7 h-7 text-green-600" />
                    </motion.div>
                    <span className="text-green-700 font-bold text-xl">
                      {user?.status === 'early_access' ? 'Early Access Granted!' : 'Beta Access Approved!'}
                    </span>
                    <Badge className="bg-green-500 text-white text-sm px-4 py-1 font-bold">APPROVED</Badge>
                  </motion.div>
                  
                  <motion.h1 
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-6xl md:text-7xl font-black mb-8 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent leading-tight"
                  >
                    🎉 Congratulations!
                    <motion.span
                      animate={{ 
                        rotate: [0, 15, -15, 0],
                        scale: [1, 1.3, 1]
                      }}
                      transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                      className="inline-block ml-4 text-yellow-400"
                    >
                      ✨
                    </motion.span>
                  </motion.h1>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="mb-12 text-center"
                  >
                    <p className="text-3xl md:text-4xl text-gray-800 mb-6 font-bold">
                      Welcome to VeeFore Beta Access! 🚀
                    </p>
                    <p className="text-xl text-gray-700 max-w-4xl mx-auto leading-relaxed">
                      You've been selected for exclusive beta access to the future of 
                      <span className="font-bold text-transparent bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text"> AI-powered social media management</span>. 
                      Your account is ready - let's build something amazing together!
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                    className="flex flex-col sm:flex-row gap-6 justify-center mb-12"
                  >
                    <button
                      onClick={() => {
                        // Redirect to signup with email pre-filled
                        const email = user?.email || '';
                        window.location.href = `/signup?email=${encodeURIComponent(email)}`;
                      }}
                      className="group bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-12 py-5 rounded-2xl font-bold text-xl shadow-2xl hover:shadow-green-500/25 transition-all duration-300 transform hover:-translate-y-2"
                    >
                      <div className="flex items-center space-x-4">
                        <Rocket className="w-7 h-7" />
                        <span>Create Your Account Now</span>
                        <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setActiveTab('benefits')}
                      className="group border-3 border-emerald-300 bg-emerald-50/90 backdrop-blur-xl text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 px-10 py-5 rounded-2xl font-bold text-xl transition-all duration-300 shadow-xl hover:shadow-2xl"
                    >
                      <div className="flex items-center space-x-3">
                        <Gift className="w-6 h-6" />
                        <span>View Beta Benefits</span>
                      </div>
                    </button>
                  </motion.div>
                </>
              ) : (
                // Regular Waitlist Display
                <>
                  <motion.div
                    initial={{ scale: 0, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                    className="inline-flex items-center space-x-3 bg-gradient-to-r from-emerald-100 to-blue-100 rounded-full px-6 py-3 mb-8 border border-emerald-200/50"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    >
                      <Crown className="w-6 h-6 text-emerald-600" />
                    </motion.div>
                    <span className="text-emerald-700 font-semibold text-lg">Premium Waitlist</span>
                    <Badge className="bg-blue-500 text-white text-xs px-2 py-1">WAITLISTED</Badge>
                  </motion.div>
                  
                  <motion.h1 
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r from-gray-900 via-blue-700 to-purple-700 bg-clip-text text-transparent leading-tight"
                  >
                    Welcome, {user?.name || 'Creator'}!
                    <motion.span
                      animate={{ 
                        rotate: [0, 10, 0, -10, 0],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ duration: 3, repeat: Infinity, delay: 1 }}
                      className="inline-block ml-4 text-yellow-500"
                    >
                      👋
                    </motion.span>
                  </motion.h1>
                  
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="text-2xl text-gray-700 mb-12 max-w-3xl leading-relaxed"
                  >
                    You're part of an exclusive community shaping the future of 
                    <span className="font-semibold text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text"> AI-powered content creation</span>. 
                    Your journey to revolutionize social media starts soon.
                  </motion.p>
                </>
              )}

              {/* Creative Stats Display */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { 
                    icon: Target, 
                    label: "Queue Position", 
                    value: "#1", 
                    subtitle: "You're at the front!",
                    gradient: "from-yellow-400 to-orange-500",
                    bgColor: "from-yellow-50 to-orange-50",
                    borderColor: "border-yellow-200",
                    delay: 0.8 
                  },
                  { 
                    icon: Zap, 
                    label: "Estimated Access", 
                    value: "2-3 weeks", 
                    subtitle: "Priority processing",
                    gradient: "from-green-400 to-emerald-500",
                    bgColor: "from-green-50 to-emerald-50",
                    borderColor: "border-green-200",
                    delay: 1.0 
                  },
                  { 
                    icon: Users, 
                    label: "Referrals Made", 
                    value: `${user?.referralCount || 0}`, 
                    subtitle: "Friends invited",
                    gradient: "from-purple-400 to-pink-500",
                    bgColor: "from-purple-50 to-pink-50",
                    borderColor: "border-purple-200",
                    delay: 1.2 
                  }
                ].map((stat, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 40, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ 
                      delay: stat.delay, 
                      type: "spring", 
                      stiffness: 150,
                      damping: 20 
                    }}
                    whileHover={{ 
                      y: -8,
                      transition: { duration: 0.2 } 
                    }}
                    className="group relative"
                  >
                    <div className={`bg-gradient-to-br ${stat.bgColor} backdrop-blur-sm rounded-2xl p-8 border ${stat.borderColor} shadow-lg hover:shadow-xl transition-all duration-300`}>
                      <motion.div
                        whileHover={{ rotate: 360 }}
                        transition={{ duration: 0.6 }}
                        className={`w-14 h-14 bg-gradient-to-r ${stat.gradient} rounded-2xl flex items-center justify-center mb-6 shadow-md group-hover:shadow-lg transition-all`}
                      >
                        <stat.icon className="w-7 h-7 text-white" />
                      </motion.div>
                      <div className="text-sm font-medium text-gray-600 mb-2">{stat.label}</div>
                      <div className="text-4xl font-black text-gray-900 mb-2">{stat.value}</div>
                      <div className="text-sm text-gray-500">{stat.subtitle}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Enhanced Tab System with More Options */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4 }}
          className="mb-8"
        >
          <div className="flex flex-wrap gap-2 p-2 bg-white rounded-2xl shadow-lg border border-gray-100">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'progress', label: 'Progress', icon: Activity },
              { id: 'referrals', label: 'Referrals', icon: Share2 },
              { id: 'benefits', label: 'Benefits', icon: Gift },
              { id: 'notifications', label: 'Updates', icon: Bell },
              { id: 'timeline', label: 'Timeline', icon: Calendar }
            ].map((tab) => (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-300 relative ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === 'notifications' && notifications.some(n => !n.read) && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"
                  />
                )}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Dynamic Content Based on Active Tab */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Personal Waitlist Status */}
                <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center">
                          <Crown className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl font-bold text-gray-900">Your Waitlist Status</CardTitle>
                          <p className="text-gray-600">Welcome back, {user?.name}!</p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800 px-4 py-2 text-lg font-semibold">
                        Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="text-center">
                        <div className="text-5xl font-black text-indigo-600 mb-3">
                          #{user?.position || '247'}
                        </div>
                        <div className="text-gray-600 font-medium">Your Position</div>
                        <p className="text-sm text-gray-500 mt-2">You're ahead of {stats.totalUsers - (user?.position || 247)} people!</p>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-5xl font-black text-purple-600 mb-3">
                          {user?.referralCount || 0}
                        </div>
                        <div className="text-gray-600 font-medium">Friends Invited</div>
                        <p className="text-sm text-gray-500 mt-2">Each referral moves you up 5 spots</p>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-5xl font-black text-blue-600 mb-3">
                          {user?.credits || 0}
                        </div>
                        <div className="text-gray-600 font-medium">Early Access Credits</div>
                        <p className="text-sm text-gray-500 mt-2">Bonus credits for being early</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 shadow-lg">
                    <CardContent className="p-8">
                      <div className="flex items-center space-x-4 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center">
                          <Share2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Share & Skip Ahead</h3>
                          <p className="text-gray-600">Invite friends to move up faster</p>
                        </div>
                      </div>
                      <Button 
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-medium py-3"
                        onClick={() => setActiveTab('referrals')}
                      >
                        Get My Referral Link
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-lg">
                    <CardContent className="p-8">
                      <div className="flex items-center space-x-4 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                          <Bell className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Stay Updated</h3>
                          <p className="text-gray-600">Get notified about your status</p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full border-blue-300 text-blue-700 hover:bg-blue-50 font-medium py-3"
                        onClick={() => setActiveTab('notifications')}
                      >
                        View Notifications
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Platform Overview */}
                <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 border-b border-gray-100">
                    <CardTitle className="text-2xl font-bold text-gray-900 flex items-center">
                      <Rocket className="w-8 h-8 text-green-600 mr-3" />
                      What's VeeFore?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4">AI-Powered Social Media Management</h4>
                        <ul className="space-y-3">
                          <li className="flex items-center space-x-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-gray-700">Automated content creation and scheduling</span>
                          </li>
                          <li className="flex items-center space-x-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-gray-700">Intelligent audience engagement</span>
                          </li>
                          <li className="flex items-center space-x-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-gray-700">Advanced analytics and insights</span>
                          </li>
                          <li className="flex items-center space-x-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-gray-700">Multi-platform management</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4">Community Stats</h4>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <span className="text-gray-700">Total Waitlist Members</span>
                            <span className="font-bold text-gray-900">{stats.totalUsers.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <span className="text-gray-700">Average Wait Time</span>
                            <span className="font-bold text-gray-900">{stats.avgWaitTime}</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <span className="text-gray-700">Development Progress</span>
                            <span className="font-bold text-green-600">{stats.launchProgress}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'progress' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Enhanced Launch Progress */}
                  <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-100">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                          <Rocket className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-xl font-bold text-gray-900">Launch Timeline</CardTitle>
                          <p className="text-gray-600">Track our progress to launch</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8">
                      <CreativeProgress value={stats.launchProgress} label="Platform Development" />
                      
                      <div className="mt-8 space-y-4">
                        {[
                          { phase: "Beta Testing", status: "current", progress: 85, description: "Testing core features with select users" },
                          { phase: "Security Audit", status: "upcoming", progress: 60, description: "Third-party security review" },
                          { phase: "Launch Preparation", status: "planned", progress: 30, description: "Final preparations for public release" }
                        ].map((phase, index) => (
                          <motion.div 
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-3">
                                <div className={`w-3 h-3 rounded-full ${
                                  phase.status === 'current' ? 'bg-green-500' :
                                  phase.status === 'upcoming' ? 'bg-yellow-500' : 'bg-gray-400'
                                }`} />
                                <span className="font-medium text-gray-900">{phase.phase}</span>
                              </div>
                              <span className="text-sm font-semibold text-gray-700">{phase.progress}%</span>
                            </div>
                            <p className="text-sm text-gray-600 ml-6">{phase.description}</p>
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Enhanced Community Stats */}
                  <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 border-b border-gray-100">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-2xl flex items-center justify-center">
                          <Globe className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-xl font-bold text-gray-900">Community Growth</CardTitle>
                          <p className="text-gray-600">Real-time waitlist statistics</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="grid grid-cols-1 gap-6">
                        <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
                          <motion.div
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 3, repeat: Infinity }}
                            className="text-4xl font-black text-gray-900 mb-2"
                          >
                            {stats.totalUsers.toLocaleString()}
                          </motion.div>
                          <div className="text-gray-600 mb-3">Total Members</div>
                          <div className="flex items-center justify-center space-x-1">
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-green-600 font-medium">+247 today</span>
                          </div>
                        </div>
                        
                        <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-100">
                          <div className="text-4xl font-black text-gray-900 mb-2">{stats.avgWaitTime}</div>
                          <div className="text-gray-600 mb-3">Average Wait Time</div>
                          <div className="flex items-center justify-center space-x-1">
                            <Clock className="w-4 h-4 text-purple-500" />
                            <span className="text-sm text-purple-600 font-medium">Decreasing</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Detailed Progress Metrics */}
                <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-indigo-50 to-cyan-50 border-b border-gray-100">
                    <CardTitle className="text-2xl font-bold text-gray-900 flex items-center">
                      <Activity className="w-8 h-8 text-indigo-600 mr-3" />
                      Development Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {[
                        {
                          title: "AI Features",
                          progress: 92,
                          items: [
                            { name: "Content Generation", completed: true },
                            { name: "Smart Scheduling", completed: true },
                            { name: "Analytics AI", completed: true },
                            { name: "Voice Recognition", completed: false }
                          ]
                        },
                        {
                          title: "Platform Core",
                          progress: 88,
                          items: [
                            { name: "User Management", completed: true },
                            { name: "Database Systems", completed: true },
                            { name: "Security Layer", completed: true },
                            { name: "Load Testing", completed: false }
                          ]
                        },
                        {
                          title: "User Experience",
                          progress: 95,
                          items: [
                            { name: "Interface Design", completed: true },
                            { name: "Mobile App", completed: true },
                            { name: "Accessibility", completed: true },
                            { name: "Tutorial System", completed: true }
                          ]
                        }
                      ].map((category, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 30 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.2 }}
                          className="space-y-4"
                        >
                          <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">{category.title}</h3>
                            <div className="relative w-24 h-24 mx-auto mb-4">
                              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="40"
                                  stroke="currentColor"
                                  strokeWidth="8"
                                  fill="transparent"
                                  className="text-gray-200"
                                />
                                <motion.circle
                                  cx="50"
                                  cy="50"
                                  r="40"
                                  stroke="currentColor"
                                  strokeWidth="8"
                                  fill="transparent"
                                  strokeLinecap="round"
                                  className="text-indigo-600"
                                  initial={{ pathLength: 0 }}
                                  animate={{ pathLength: category.progress / 100 }}
                                  transition={{ duration: 2, delay: index * 0.3 }}
                                  style={{
                                    strokeDasharray: "251.2",
                                    strokeDashoffset: `${251.2 * (1 - category.progress / 100)}`,
                                  }}
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-2xl font-bold text-gray-900">{category.progress}%</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            {category.items.map((item, itemIndex) => (
                              <motion.div
                                key={itemIndex}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: (index * 0.2) + (itemIndex * 0.1) }}
                                className="flex items-center space-x-3 p-3 rounded-xl bg-gray-50"
                              >
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                  item.completed ? 'bg-green-500' : 'bg-gray-300'
                                }`}>
                                  {item.completed && <Check className="w-4 h-4 text-white" />}
                                </div>
                                <span className={`text-sm font-medium ${
                                  item.completed ? 'text-gray-900' : 'text-gray-600'
                                }`}>
                                  {item.name}
                                </span>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Team Activity Feed */}
                <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50 border-b border-gray-100">
                    <CardTitle className="text-2xl font-bold text-gray-900 flex items-center">
                      <Users className="w-8 h-8 text-orange-600 mr-3" />
                      Development Team Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="space-y-4">
                      {[
                        { time: "2 hours ago", activity: "Security patches deployed to production", team: "DevOps Team", type: "deployment" },
                        { time: "4 hours ago", activity: "New AI model integration completed", team: "AI Engineering", type: "feature" },
                        { time: "6 hours ago", activity: "Mobile app performance optimizations", team: "Mobile Team", type: "improvement" },
                        { time: "8 hours ago", activity: "User feedback analysis and improvements", team: "UX Research", type: "research" },
                        { time: "12 hours ago", activity: "Database backup and optimization completed", team: "Backend Team", type: "maintenance" }
                      ].map((activity, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-start space-x-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                            activity.type === 'deployment' ? 'bg-green-500' :
                            activity.type === 'feature' ? 'bg-blue-500' :
                            activity.type === 'improvement' ? 'bg-purple-500' :
                            activity.type === 'research' ? 'bg-orange-500' : 'bg-gray-500'
                          }`}>
                            {activity.type === 'deployment' && <Rocket className="w-6 h-6 text-white" />}
                            {activity.type === 'feature' && <Star className="w-6 h-6 text-white" />}
                            {activity.type === 'improvement' && <Zap className="w-6 h-6 text-white" />}
                            {activity.type === 'research' && <Target className="w-6 h-6 text-white" />}
                            {activity.type === 'maintenance' && <Shield className="w-6 h-6 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-900 font-medium mb-1">{activity.activity}</p>
                            <div className="flex items-center space-x-4">
                              <span className="text-sm font-medium text-gray-700">{activity.team}</span>
                              <span className="text-sm text-gray-500">•</span>
                              <span className="text-sm text-gray-500">{activity.time}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'referrals' && (
              <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center">
                      <Gift className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-bold text-gray-900">Referral Program</CardTitle>
                      <p className="text-gray-600">Share and skip ahead in line</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-3xl p-8 border border-purple-100 mb-8">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Your Referral Code</h3>
                        <p className="text-gray-600">Each friend you invite moves you up 5 positions</p>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl font-black text-purple-600 mb-1">{user?.referralCount || 0}</div>
                        <div className="text-sm text-gray-500">friends invited</div>
                      </div>
                    </div>
                    
                    <div className="relative group">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="flex items-center space-x-4 p-6 bg-white rounded-2xl border border-purple-200 shadow-md"
                      >
                        <code className="flex-1 text-2xl font-mono font-bold text-purple-700 tracking-wider">
                          {user?.referralCode || 'LOADING...'}
                        </code>
                        <motion.div whileTap={{ scale: 0.9 }}>
                          <Button
                            onClick={copyReferralCode}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-xl shadow-lg"
                          >
                            {copiedReferral ? (
                              <>
                                <Check className="w-5 h-5 mr-2" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-5 h-5 mr-2" />
                                Copy Link
                              </>
                            )}
                          </Button>
                        </motion.div>
                      </motion.div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                      <Button className="w-full h-16 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-2xl text-lg shadow-lg">
                        <Share2 className="w-5 h-5 mr-3" />
                        Share on Social Media
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                      <Button variant="outline" className="w-full h-16 border-2 border-gray-300 hover:bg-gray-50 rounded-2xl text-lg">
                        <Mail className="w-5 h-5 mr-3" />
                        Email Friends
                      </Button>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'benefits' && (
              <div className="space-y-8">
                {/* Premium Benefits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {[
                    { 
                      icon: Gift, 
                      title: "50% Launch Discount", 
                      description: "Save big with our early bird special pricing for the first year.",
                      value: "$297 saved",
                      gradient: "from-green-500 to-emerald-600",
                      bg: "from-green-50 to-emerald-50"
                    },
                    { 
                      icon: Zap, 
                      title: "Priority Support", 
                      description: "Get dedicated 24/7 customer support with priority response times.",
                      value: "< 1 hour response",
                      gradient: "from-blue-500 to-cyan-600",
                      bg: "from-blue-50 to-cyan-50"
                    },
                    { 
                      icon: Star, 
                      title: "Exclusive Features", 
                      description: "Beta access to new AI tools and features before public release.",
                      value: "3 months early",
                      gradient: "from-purple-500 to-indigo-600",
                      bg: "from-purple-50 to-indigo-50"
                    },
                    { 
                      icon: Award, 
                      title: "Founder Status", 
                      description: "Lifetime recognition as a founding member with special badges.",
                      value: "Permanent badge",
                      gradient: "from-pink-500 to-rose-600",
                      bg: "from-pink-50 to-rose-50"
                    }
                  ].map((benefit, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ y: -5, transition: { duration: 0.2 } }}
                    >
                      <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden h-full">
                        <CardContent className="p-8">
                          <div className={`w-16 h-16 bg-gradient-to-r ${benefit.gradient} rounded-2xl flex items-center justify-center mb-6 shadow-lg`}>
                            <benefit.icon className="w-8 h-8 text-white" />
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-2">{benefit.title}</h3>
                          <div className="text-lg font-semibold text-blue-600 mb-4">{benefit.value}</div>
                          <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* Additional Perks */}
                <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 shadow-xl border-0 rounded-3xl">
                  <CardHeader>
                    <CardTitle className="text-2xl font-bold text-gray-900 flex items-center">
                      <Gem className="w-8 h-8 text-purple-600 mr-3" />
                      Additional Member Perks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[
                        { icon: Shield, title: "Advanced Security", desc: "Enterprise-grade encryption" },
                        { icon: Briefcase, title: "Business Templates", desc: "200+ ready-made templates" },
                        { icon: Globe, title: "Multi-language Support", desc: "Content in 25+ languages" },
                        { icon: BarChart3, title: "Advanced Analytics", desc: "Deep insight reports" },
                        { icon: Users, title: "Team Collaboration", desc: "Unlimited team members" },
                        { icon: Rocket, title: "API Access", desc: "Full developer API access" }
                      ].map((perk, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-start space-x-3 p-4 bg-white rounded-2xl shadow-sm"
                        >
                          <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                            <perk.icon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1">{perk.title}</h4>
                            <p className="text-sm text-gray-600">{perk.desc}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'notifications' && (
              <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                        <Bell className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-bold text-gray-900">Latest Updates</CardTitle>
                        <p className="text-gray-600">Stay informed about your waitlist status</p>
                      </div>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700">
                      {notifications.filter(n => !n.read).length} unread
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="space-y-6">
                    {notifications.map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`flex items-start space-x-4 p-6 rounded-2xl border-2 transition-all duration-200 ${
                          !notification.read 
                            ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                          notification.type === 'success' ? 'bg-green-500' :
                          notification.type === 'info' ? 'bg-blue-500' :
                          'bg-purple-500'
                        }`}>
                          {notification.type === 'success' && <Check className="w-6 h-6 text-white" />}
                          {notification.type === 'info' && <Bell className="w-6 h-6 text-white" />}
                          {notification.type === 'update' && <Zap className="w-6 h-6 text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-900 font-medium mb-1">{notification.message}</p>
                          <p className="text-sm text-gray-500">{notification.time}</p>
                        </div>
                        {!notification.read && (
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-3 h-3 bg-blue-500 rounded-full"
                          />
                        )}
                      </motion.div>
                    ))}
                  </div>

                  {/* Newsletter Signup */}
                  <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-200">
                    <div className="flex items-center space-x-4 mb-4">
                      <Mail className="w-8 h-8 text-purple-600" />
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Stay Updated</h3>
                        <p className="text-gray-600">Get weekly updates about VeeFore development</p>
                      </div>
                    </div>
                    <div className="flex space-x-4">
                      <input
                        type="email"
                        placeholder="Your email address"
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        defaultValue={user?.email || ''}
                        readOnly
                      />
                      <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-xl">
                        Subscribe
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'timeline' && (
              <Card className="bg-white shadow-xl border-0 rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 border-b border-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-600 rounded-2xl flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-bold text-gray-900">Your Journey Timeline</CardTitle>
                      <p className="text-gray-600">Track your progress through the waitlist</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="space-y-8">
                    {milestones.map((milestone, index) => (
                      <motion.div
                        key={milestone.id}
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.2 }}
                        className="flex items-start space-x-6"
                      >
                        <div className="relative">
                          <motion.div
                            animate={milestone.completed ? { scale: [1, 1.1, 1] } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                            className={`w-16 h-16 rounded-2xl flex items-center justify-center border-4 ${
                              milestone.completed 
                                ? 'bg-green-500 border-green-200' 
                                : 'bg-gray-100 border-gray-300'
                            }`}
                          >
                            {milestone.completed ? (
                              <Check className="w-8 h-8 text-white" />
                            ) : (
                              <Clock className="w-8 h-8 text-gray-500" />
                            )}
                          </motion.div>
                          {index < milestones.length - 1 && (
                            <div className={`absolute left-8 top-16 w-px h-16 ${
                              milestone.completed ? 'bg-green-300' : 'bg-gray-300'
                            }`} />
                          )}
                        </div>
                        <div className="flex-1 pt-2">
                          <h3 className={`text-xl font-bold mb-2 ${
                            milestone.completed ? 'text-green-700' : 'text-gray-700'
                          }`}>
                            {milestone.title}
                          </h3>
                          <p className="text-gray-600 mb-3">{milestone.description}</p>
                          {milestone.date && (
                            <p className="text-sm text-gray-500">
                              Completed on {new Date(milestone.date).toLocaleDateString()}
                            </p>
                          )}
                          {!milestone.completed && milestone.id === 4 && (
                            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                              <div className="flex items-center space-x-2 mb-2">
                                <TrendingUp className="w-5 h-5 text-blue-600" />
                                <span className="font-semibold text-blue-700">Coming Soon</span>
                              </div>
                              <p className="text-sm text-blue-600">
                                Beta invitations start rolling out in the next 2-3 weeks based on queue position and engagement.
                              </p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Estimated Timeline */}
                  <div className="mt-12 p-8 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                      <Rocket className="w-6 h-6 text-indigo-600 mr-3" />
                      Estimated Timeline
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                        <div className="text-2xl font-black text-indigo-600 mb-2">Week 1-2</div>
                        <div className="text-sm text-gray-600">Beta Invitations</div>
                      </div>
                      <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                        <div className="text-2xl font-black text-purple-600 mb-2">Week 3-4</div>
                        <div className="text-sm text-gray-600">Early Access</div>
                      </div>
                      <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                        <div className="text-2xl font-black text-pink-600 mb-2">Week 5-6</div>
                        <div className="text-sm text-gray-600">Full Launch</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6 }}
          className="mt-12 flex flex-wrap gap-4 justify-center"
        >
          {[
            { icon: Bell, label: "Enable Notifications", variant: "default" as const },
            { icon: Download, label: "Download Mobile App", variant: "outline" as const },
            { icon: Settings, label: "Account Settings", variant: "outline" as const }
          ].map((action, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                variant={action.variant}
                className={`px-8 py-4 rounded-2xl text-lg shadow-lg ${
                  action.variant === 'default' 
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-xl' 
                    : 'border-2 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <action.icon className="w-5 h-5 mr-3" />
                {action.label}
              </Button>
            </motion.div>
          ))}
        </motion.div>

        {/* Professional Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
          className="mt-16 text-center py-12 border-t border-gray-200"
        >
          <p className="text-gray-600 text-lg mb-6">
            Have questions about your early access?{' '}
            <a href="mailto:support@veefore.com" className="text-blue-600 hover:text-blue-700 font-semibold underline">
              Contact our support team
            </a>
          </p>
          <div className="flex items-center justify-center space-x-8">
            {[
              { icon: MessageSquare, label: "Live Chat" },
              { icon: BookOpen, label: "Help Center" },
              { icon: HeartHandshake, label: "Community" }
            ].map((item, index) => (
              <motion.div
                key={index}
                whileHover={{ y: -2, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button variant="ghost" size="lg" className="text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl">
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default WaitlistStatus;