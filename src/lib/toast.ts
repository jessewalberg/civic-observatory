import { toast as sonnerToast } from 'sonner'

export const toast = {
  success: (message: string, description?: string) => {
    sonnerToast.success(message, {
      description,
    })
  },

  error: (message: string, description?: string) => {
    sonnerToast.error(message, {
      description,
    })
  },

  warning: (message: string, description?: string) => {
    sonnerToast.warning(message, {
      description,
    })
  },

  info: (message: string, description?: string) => {
    sonnerToast.info(message, {
      description,
    })
  },

  loading: (message: string) => {
    return sonnerToast.loading(message)
  },

  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId)
  },

  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: Error) => string)
    }
  ) => {
    return sonnerToast.promise(promise, messages)
  },
}

// Common toast patterns
export const showCopyToast = () => {
  toast.success('Copied to clipboard')
}

export const showSaveToast = () => {
  toast.success('Changes saved')
}

export const showDeleteToast = (itemName = 'Item') => {
  toast.success(`${itemName} deleted`)
}

export const showErrorToast = (message = 'Something went wrong', error?: Error) => {
  toast.error(message, error?.message)
}

export const showNetworkErrorToast = () => {
  toast.error('Network error', 'Please check your connection and try again')
}

export const showRateLimitToast = () => {
  toast.warning('Rate limit reached', 'Please wait a moment before trying again')
}

export const showAuthRequiredToast = () => {
  toast.info('Sign in required', 'Please sign in to continue')
}
