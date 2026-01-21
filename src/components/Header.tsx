import { Link } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import type { User } from '@workos-inc/node'
import { SignInButton } from './SignInButton'

interface HeaderProps {
  user: User | null
  signInUrl: string
}

export function Header({ user, signInUrl }: HeaderProps) {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">Civic Pulse</span>
        </Link>

        <nav className="flex items-center gap-6">
          <SignInButton user={user} signInUrl={signInUrl} />
        </nav>
      </div>
    </header>
  )
}
