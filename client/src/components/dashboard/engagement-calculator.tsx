import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calculator, TrendingUp, Users, Eye } from 'lucide-react';
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher';
import { apiRequest } from '@/lib/queryClient';

interface EngagementCalculation {
  method: 'ERF' | 'AER' | 'ERR';
  rate: number;
  description: string;
}

interface EngagementCalculatorProps {
  currentEngagement?: number;
  followers?: number;
  reach?: number;
  totalLikes?: number;
  totalComments?: number;
}

export function EngagementCalculator({ 
  currentEngagement = 0, 
  followers = 0, 
  reach = 0, 
  totalLikes = 0, 
  totalComments = 0 
}: EngagementCalculatorProps) {
  const { currentWorkspace } = useCurrentWorkspace();
  const [selectedMethod, setSelectedMethod] = useState<'smart' | 'erf' | 'err'>('smart');
  const [selectedPosts, setSelectedPosts] = useState<string>('all');
  const [calculation, setCalculation] = useState<EngagementCalculation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateEngagement = async () => {
    if (!currentWorkspace?.id) {
      setError('No workspace selected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest('/api/engagement/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          method: selectedMethod,
          postCount: selectedPosts,
          timePeriod: 'all'
        }),
      });

      if (response.success) {
        setCalculation(response.calculation);
      } else {
        setError(response.error || 'Calculation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to calculate engagement');
    } finally {
      setIsLoading(false);
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'ERF': return <Users className="h-4 w-4" />;
      case 'ERR': return <Eye className="h-4 w-4" />;
      default: return <TrendingUp className="h-4 w-4" />;
    }
  };

  const getMethodDescription = (method: string) => {
    switch (method) {
      case 'ERF': return 'Industry standard for large accounts (1000+ followers)';
      case 'ERR': return 'Best for small accounts (3-100 followers) with reach data';
      case 'smart': return 'Automatically chooses the best method for your account size';
      default: return '';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Advanced Engagement Calculator
        </CardTitle>
        <CardDescription>
          Choose how to calculate your engagement rate based on your account size and needs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Metrics Display */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{followers}</div>
            <div className="text-sm text-muted-foreground">Followers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{reach}</div>
            <div className="text-sm text-muted-foreground">Reach</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{totalLikes + totalComments}</div>
            <div className="text-sm text-muted-foreground">Total Engagement</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{currentEngagement.toFixed(1)}%</div>
            <div className="text-sm text-muted-foreground">Current Rate</div>
          </div>
        </div>

        {/* Calculation Controls */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Calculation Method</label>
            <Select value={selectedMethod} onValueChange={(value: any) => setSelectedMethod(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select calculation method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    <div>
                      <div className="font-medium">Smart (Recommended)</div>
                      <div className="text-xs text-muted-foreground">Auto-selects best method</div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="erf">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <div>
                      <div className="font-medium">ERF (By Followers)</div>
                      <div className="text-xs text-muted-foreground">Industry standard</div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="err">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <div>
                      <div className="font-medium">ERR (By Reach)</div>
                      <div className="text-xs text-muted-foreground">For small accounts</div>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {getMethodDescription(selectedMethod)}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Posts to Analyze</label>
            <Select value={selectedPosts} onValueChange={setSelectedPosts}>
              <SelectTrigger>
                <SelectValue placeholder="Select posts count" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Posts</SelectItem>
                <SelectItem value="1">Last 1 Post</SelectItem>
                <SelectItem value="3">Last 3 Posts</SelectItem>
                <SelectItem value="5">Last 5 Posts</SelectItem>
                <SelectItem value="10">Last 10 Posts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={calculateEngagement} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Calculating...' : 'Calculate Engagement Rate'}
          </Button>
        </div>

        {/* Results Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {calculation && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                {getMethodIcon(calculation.method)}
                <Badge variant="secondary" className="text-green-700 bg-green-100">
                  {calculation.method}
                </Badge>
                <span className="text-2xl font-bold text-green-700">
                  {calculation.rate.toFixed(2)}%
                </span>
              </div>
              <p className="text-sm text-green-600">{calculation.description}</p>
            </div>

            {/* Method Comparison */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Method Comparison</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="p-2 bg-blue-50 rounded">
                  <div className="font-medium text-blue-700">ERF (By Followers)</div>
                  <div className="text-blue-600">Best for: Large accounts, brand deals</div>
                </div>
                <div className="p-2 bg-green-50 rounded">
                  <div className="font-medium text-green-700">ERR (By Reach)</div>
                  <div className="text-green-600">Best for: Small accounts, realistic metrics</div>
                </div>
                <div className="p-2 bg-purple-50 rounded">
                  <div className="font-medium text-purple-700">Smart</div>
                  <div className="text-purple-600">Auto-selects based on account size</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Account Size Recommendations */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-700 mb-2">Account Size Recommendations</h4>
          <div className="text-sm text-blue-600 space-y-1">
            <div><strong>3-100 followers:</strong> Use ERR (By Reach) for realistic metrics</div>
            <div><strong>100-1000 followers:</strong> Use Smart calculation (auto-selects)</div>
            <div><strong>1000+ followers:</strong> Use ERF (By Followers) for industry standard</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
