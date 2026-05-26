import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, CheckCircle, Plus, Calendar, BarChart3, Gift } from 'lucide-react'

const tasks = [
  {
    icon: Plus,
    title: 'Add another social account',
    description: 'Connect an additional social account.',
    completed: true
  },
  {
    icon: Calendar,
    title: 'Schedule 3 posts',
    description: 'Create and schedule 3 posts.',
    completed: true
  },
  {
    icon: BarChart3,
    title: 'Report on your wins with Analytics',
    description: 'See how your posts are performing.',
    completed: false
  },
  {
    icon: Gift,
    title: 'Unlock your reward!',
    description: '',
    completed: false
  }
]

export function GetStarted() {
  return (
    <Card className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 border-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">Get started - earn a reward!</CardTitle>
        <Button variant="ghost" size="icon" className="hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all duration-300">
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {tasks.map((task, index) => (
          <div key={index} className="flex items-start space-x-4 p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-green-50/30 dark:from-gray-700 dark:to-green-900/30 hover:from-green-50 hover:to-emerald-50/50 dark:hover:from-green-900/50 dark:hover:to-emerald-900/50 transition-all duration-300 group">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg transition-all duration-300 ${
              task.completed 
                ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white' 
                : 'bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 group-hover:border-green-300 dark:group-hover:border-green-500'
            }`}>
              {task.completed ? (
                <CheckCircle className="w-6 h-6" />
              ) : (
                <task.icon className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1 text-lg">{task.title}</h4>
              {task.description && (
                <p className="text-gray-700 dark:text-gray-300">{task.description}</p>
              )}
            </div>
            {index === 2 && (
              <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm px-3 py-1 rounded-full font-bold shadow-lg">3</span>
            )}
          </div>
        ))}

        {/* Kickstart Section */}
        <div className="mt-8 p-6 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 dark:from-blue-600 dark:via-purple-600 dark:to-indigo-700 rounded-3xl text-white relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 backdrop-blur-sm bg-[#6fbbdead] dark:bg-[#4a5568aa]"></div>
          <div className="relative z-10">
            <h4 className="font-bold text-xl mb-3">Kickstart your social content</h4>
            <p className="text-white/90 mb-6 leading-relaxed">Get 30 days of social media posts in minutes with AI-powered content generation</p>
            <Button size="lg" className="bg-white dark:bg-gray-100 text-blue-600 dark:text-blue-700 hover:bg-blue-50 dark:hover:bg-gray-200 font-bold shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5">
              <Gift className="w-5 h-5 mr-2" />
              Get started
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}