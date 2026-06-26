'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EAE8E1] px-4">
      <Card className="w-full max-w-sm border-[#D4CFBA] shadow-sm">
        <CardHeader className="pb-2 text-center space-y-3">
          <div className="flex justify-center">
            {/* Logo placeholder — swap for LegacyLogos base64 once imported */}
            <div className="w-12 h-12 rounded-lg bg-[#3d3d1e] flex items-center justify-center">
              <span className="text-[#EAE8E1] font-bold text-lg">L</span>
            </div>
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold text-[#3d3d1e]">Legacy Suite</h1>
            <p className="text-sm text-[#7A7560] mt-0.5">Sign in to continue</p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
