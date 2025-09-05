import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Tag } from 'lucide-react'

export const CouponsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Coupon Management</h1>
        <p className="text-gray-600">Create and manage discount coupons</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Coupons</CardTitle>
          <CardDescription>Coupon management functionality will be implemented here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <Tag className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Coupon management table will be implemented here</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
