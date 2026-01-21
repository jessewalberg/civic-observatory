import type { User } from '@workos-inc/node'
import { LogIn, LogOut } from 'lucide-react'
import { Button } from './ui/button'

interface SignInButtonProps {
  user: User | null
  signInUrl: string
}

export function SignInButton({ user, signInUrl }: SignInButtonProps) {
  if (user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{user.email}</span>
        <Button variant="secondary" size="sm" asChild>
          <a href="/api/auth/logout">
            <LogOut className="h-4 w-4" />
            Sign out
          </a>
        </Button>
      </div>
    )
  }

  return (
    <Button asChild>
      <a href={signInUrl}>
        <LogIn className="h-4 w-4" />
        Sign in
      </a>
    </Button>
  )
}
