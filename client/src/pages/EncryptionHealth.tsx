import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield } from 'lucide-react'

export default function EncryptionHealth() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/health/encryption')
        const json = await res.json()
        setData(json)
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
      }
    }
    run()
  }, [])

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="bg-white dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5" />
            <span>Encryption Health</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {data && (
            <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
              <div>Algorithm: {data.algorithm}</div>
              <div>Key Size: {data.keyBits} bits</div>
              <div>KDF Iterations: {data.kdfIterations}</div>
              <div>Rotation Days: {data.rotationDays}</div>
              <div>Rotation Active: {String(data.rotationActive)}</div>
              <div>Environment: {data.environment}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
