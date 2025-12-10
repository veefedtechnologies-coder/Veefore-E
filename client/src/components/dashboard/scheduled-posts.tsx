import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Clock, Eye } from 'lucide-react'
import { useLocation } from 'wouter'

function ScheduledPostItemSkeleton() {
  return (
    <div className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
      <Skeleton className="w-16 h-16 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex items-center space-x-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-8 w-20 rounded-lg" />
    </div>
  )
}

export function ScheduledPostsSkeleton() {
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((i) => (
          <ScheduledPostItemSkeleton key={i} />
        ))}
      </CardContent>
    </Card>
  )
}

interface ScheduledPostsProps {
  isLoading?: boolean
}

export function ScheduledPosts({ isLoading }: ScheduledPostsProps = {}) {
  const [, setLocation] = useLocation()
  
  if (isLoading) {
    return <ScheduledPostsSkeleton />
  }
  
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scheduled posts</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Created in VeeFore</p>
        </div>
        <Button variant="outline" size="sm">
          <Eye className="w-4 h-4 mr-2" />
          View all scheduled
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">No scheduled posts</p>
          <Button 
            onClick={() => setLocation('/create')}
            className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-700"
          >
            Create a post
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function DraftsSkeleton() {
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <Skeleton className="w-14 h-14 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

interface DraftsProps {
  isLoading?: boolean
}

export function Drafts({ isLoading }: DraftsProps = {}) {
  if (isLoading) {
    return <DraftsSkeleton />
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Drafts</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Created in VeeFore</p>
        </div>
        <Button variant="outline" size="sm">
          View all drafts
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Start drafting content to edit and publish whenever you'd like.
          </p>
          <div className="flex justify-center space-x-3">
            <Button variant="outline">
              Create a draft
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
              Draft post with AI
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}