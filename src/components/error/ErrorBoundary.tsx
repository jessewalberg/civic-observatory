import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center justify-center p-8">
          <Card className="p-6 max-w-md w-full">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-red-500/10 p-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                Something went wrong
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                An unexpected error occurred. Please try again.
              </p>
              {this.state.error && (
                <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded mb-4 w-full overflow-auto">
                  {this.state.error.message}
                </p>
              )}
              <Button onClick={this.handleRetry} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
