import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Ticket } from 'lucide-react'

export const TicketsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
        <p className="text-gray-600">Manage customer support tickets</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>Support ticket management functionality will be implemented here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <Ticket className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Support ticket management table will be implemented here</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
