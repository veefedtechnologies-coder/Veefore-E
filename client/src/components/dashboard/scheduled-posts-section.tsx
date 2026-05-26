
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLocation } from 'wouter'

export function ScheduledPostsSection() {
  const [, setLocation] = useLocation()
  
  return (
    <Card data-testid="scheduled-posts" className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scheduled posts</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Created in Hootsuite</p>
          </div>
          <Button variant="outline" size="sm" className="bg-white dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400">
            View all scheduled
          </Button>
        </div>

        {/* Empty State */}
        <div className="text-center py-12">
          <div className="text-gray-500 dark:text-gray-400 mb-6 text-base">No scheduled posts</div>
          
          <Button 
            onClick={() => setLocation('/create')}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 px-8 py-3 rounded-lg font-medium"
          >
            Create a post
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}