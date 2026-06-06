const fs = require('fs');

let content = fs.readFileSync('client/src/pages/SocialListeningPage.tsx', 'utf8');

// Add imports
if (!content.includes('Dialog')) {
  content = content.replace("from '@/components/ui/badge';", "from '@/components/ui/badge';\nimport { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';");
}
if (!content.includes('Settings')) {
  content = content.replace("Globe, ExternalLink, Heart, MessageCircle", "Globe, ExternalLink, Heart, MessageCircle, Settings, Target");
}

// Add state & query
const queryInjection = `  const [isNicheDialogOpen, setIsNicheDialogOpen] = useState(false);
  const [nicheInput, setNicheInput] = useState('');

  const { data: userData, refetch: refetchUser } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => await apiRequest('/api/auth/user')
  });

  const updateNicheMutation = useMutation({
    mutationFn: async (niche: string) => {
      return await apiRequest('/api/auth/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche })
      });
    },
    onSuccess: () => {
      refetchUser();
      setIsNicheDialogOpen(false);
    }
  });

  const userNiche = userData?.user?.niche || 'Not Set';
`;
content = content.replace("  // 1. Dashboard Overview", queryInjection + "\n  // 1. Dashboard Overview");

// Update chat context
content = content.replace("context: { currentTrends: clusters, hooks, painPoints }", "context: { userNiche, currentTrends: clusters, hooks, painPoints }");

// Add Niche badge to header
const headerInjection = `        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-sm">
            Social Intelligence
          </h1>
          <div className="flex items-center mt-2 gap-3">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium tracking-wide uppercase">Real-time audience analytics</p>
            <Dialog open={isNicheDialogOpen} onOpenChange={(open) => {
              setIsNicheDialogOpen(open);
              if (open) setNicheInput(userData?.user?.niche || '');
            }}>
              <DialogTrigger asChild>
                <Badge variant="outline" className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 px-3 py-1 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10">
                  <Target className="w-3.5 h-3.5" />
                  Niche: {userNiche}
                  <Settings className="w-3 h-3 ml-1 opacity-70" />
                </Badge>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Configure Target Niche</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <p className="text-sm text-slate-500">
                    Set your specific industry or audience niche. The AI Intelligence Assistant and data extraction will be tailored to track signals relevant to this niche.
                  </p>
                  <Input 
                    value={nicheInput} 
                    onChange={e => setNicheInput(e.target.value)} 
                    placeholder="e.g. Real Estate Automation, Fitness Tech..." 
                  />
                  <Button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" 
                    onClick={() => updateNicheMutation.mutate(nicheInput)}
                    disabled={updateNicheMutation.isPending}
                  >
                    {updateNicheMutation.isPending ? 'Saving...' : 'Save Niche Preferences'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>`;
        
const oldHeader = `        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-sm">
            Social Intelligence
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium tracking-wide uppercase">Real-time audience analytics & AI insight extraction</p>
        </div>`;
content = content.replace(oldHeader, headerInjection);

fs.writeFileSync('client/src/pages/SocialListeningPage.tsx', content);
console.log('patched');
