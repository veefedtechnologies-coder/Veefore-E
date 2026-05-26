import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface PageInfo {
  id: string;
  name: string;
  access_token: string;
  permissions: string[];
  hasInstagram: boolean;
  instagramAccountId: string | null;
  isRecommended: boolean;
  error?: string;
}

interface ConversionResult {
  success: boolean;
  pages: PageInfo[];
  recommendedPage: PageInfo | null;
  message: string;
}

export function TokenConverter() {
  const [userToken, setUserToken] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [selectedPage, setSelectedPage] = useState<PageInfo | null>(null);
  const { toast } = useToast();

  const handleConvertToken = async () => {
    if (!userToken.trim()) {
      toast({
        title: "Error",
        description: "Please enter your User Access Token",
        variant: "destructive",
      });
      return;
    }

    setIsConverting(true);
    try {
      const result = await apiRequest('/api/instagram/convert-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: userToken.trim() })
      });

      setConversionResult(result);
      
      if (result.recommendedPage) {
        setSelectedPage(result.recommendedPage);
      }

      toast({
        title: "Success!",
        description: result.message,
        variant: "default",
      });

    } catch (error: any) {
      console.error('Token conversion error:', error);
      toast({
        title: "Conversion Failed",
        description: error.message || "Failed to convert token",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handleSavePageToken = async (page: PageInfo) => {
    setIsSaving(true);
    try {
      const result = await apiRequest('/api/instagram/save-page-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageAccessToken: page.access_token,
          pageId: page.id,
          pageName: page.name
        })
      });

      const isAccountUpdated = result.pageInfo?.accountUpdated;
      
      toast({
        title: isAccountUpdated ? "✅ Account Updated!" : "✅ Token Validated!",
        description: isAccountUpdated ? 
          "Instagram account updated with new Page Access Token. Also add it to Replit Secrets as backup." :
          "Page Access Token validated. Add it to your Replit Secrets as 'PAGE_ACCESS_TOKEN'",
        variant: "default",
      });

      // Show detailed instructions in console
      console.log('✅ Page Access Token validated for page:', page.name);
      if (result.instructions) {
        console.log('📝 Next steps:');
        result.instructions.steps?.forEach((step: string, index: number) => {
          console.log(`${index + 1}. ${step}`);
        });
      }

      // Show modal with detailed instructions
      const instructionsText = result.instructions?.steps?.join('\n') || 'Add token to Replit Secrets';
      
      setTimeout(() => {
        toast({
          title: "📋 Save to Replit Secrets",
          description: "Check console for full token and detailed steps",
          variant: "default",
        });
      }, 2000);

    } catch (error: any) {
      console.error('Token save error:', error);
      toast({
        title: "Validation Failed",
        description: error.message || "Failed to validate token",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Instagram Token Converter</h3>
            <p className="text-sm text-muted-foreground">
              Convert your User Access Token to a Page Access Token for Instagram automation
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="userToken">User Access Token</Label>
              <Input
                id="userToken"
                type="password"
                placeholder="Paste your User Access Token from Graph API Explorer..."
                value={userToken}
                onChange={(e) => setUserToken(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get this from{' '}
                <a 
                  href="https://developers.facebook.com/tools/explorer/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  Graph API Explorer
                </a>{' '}
                with permissions: <strong>pages_manage_metadata, pages_read_engagement, pages_show_list, instagram_basic, instagram_manage_comments</strong>
              </p>
            </div>

            <Button 
              onClick={handleConvertToken} 
              disabled={isConverting || !userToken.trim()}
              className="w-full"
              data-testid="button-convert-token"
            >
              {isConverting ? 'Converting...' : '🔄 Convert to Page Tokens'}
            </Button>
          </div>
        </div>
      </Card>

      {conversionResult && (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-semibold">Conversion Results</h4>
              <p className="text-sm text-muted-foreground">
                Found {conversionResult.pages.length} Facebook pages
              </p>
            </div>

            {conversionResult.pages.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h5 className="font-medium text-yellow-900">⚠️ No Facebook Pages Found</h5>
                <p className="text-sm text-yellow-700 mt-1">
                  Your User Access Token doesn't have access to any Facebook pages. Here's what to do:
                </p>
                <ol className="text-sm text-yellow-700 mt-2 space-y-1 list-decimal list-inside">
                  <li><strong>Check permissions:</strong> Make sure your token has pages_manage_metadata, pages_read_engagement, pages_show_list</li>
                  <li><strong>Create/manage a page:</strong> You need to be an admin of a Facebook page</li>
                  <li><strong>Connect Instagram:</strong> Link your Instagram Business Account to that Facebook page</li>
                  <li><strong>Get new token:</strong> Generate a fresh token with all required permissions</li>
                </ol>
                <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border dark:border-gray-600">
                  <p className="text-xs text-gray-600 font-medium">Quick Fix:</p>
                  <p className="text-xs text-gray-600">
                    1. Go to{' '}
                    <a href="https://developers.facebook.com/tools/explorer/" target="_blank" className="text-blue-600 underline">
                      Graph API Explorer
                    </a><br/>
                    2. Select your app → Get User Access Token<br/>
                    3. Add permissions: <code className="bg-gray-100 px-1">pages_manage_metadata, pages_read_engagement, pages_show_list, instagram_basic</code><br/>
                    4. Generate token and try again
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {conversionResult.pages.map((page) => (
                <div 
                  key={page.id} 
                  className={`border rounded-lg p-4 ${page.hasInstagram ? 'border-green-200 bg-green-50 dark:border-green-600 dark:bg-green-900/30' : 'border-gray-200 dark:border-gray-600'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h5 className="font-medium">{page.name}</h5>
                        {page.hasInstagram && (
                          <Badge variant="default" className="bg-green-500">
                            📸 Instagram Connected
                          </Badge>
                        )}
                        {page.isRecommended && (
                          <Badge variant="secondary">
                            ⭐ Recommended
                          </Badge>
                        )}
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        <p>Page ID: {page.id}</p>
                        {page.instagramAccountId && (
                          <p>Instagram Account ID: {page.instagramAccountId}</p>
                        )}
                        {page.error && (
                          <p className="text-red-500">Error: {page.error}</p>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        <p>Page Access Token: {page.access_token.substring(0, 20)}...</p>
                        <p>Permissions: {page.permissions.join(', ') || 'None specified'}</p>
                      </div>
                    </div>

                    {page.hasInstagram && (
                      <Button
                        onClick={() => handleSavePageToken(page)}
                        disabled={isSaving}
                        variant="default"
                        size="sm"
                        data-testid={`button-save-token-${page.id}`}
                      >
                        {isSaving ? 'Validating...' : '💾 Use This Token'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {conversionResult.recommendedPage && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h5 className="font-medium text-blue-900">🎯 Recommended Token</h5>
                <p className="text-sm text-blue-700 mt-1">
                  Use the token from <strong>{conversionResult.recommendedPage.name}</strong> as it has Instagram Business Account connected.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="p-6 bg-gray-50">
        <div className="space-y-3">
          <h4 className="font-medium">📋 Instructions</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Get your <strong>User Access Token</strong> from Graph API Explorer</li>
            <li>Make sure it has the required permissions for Instagram</li>
            <li>Paste the token above and click "Convert to Page Tokens"</li>
            <li>Find the page with Instagram Business Account (marked green)</li>
            <li>Click "Use This Token" to validate and save the Page Access Token</li>
            <li>Add the validated token to your Replit Secrets as <code>PAGE_ACCESS_TOKEN</code></li>
          </ol>
        </div>
      </Card>
    </div>
  );
}