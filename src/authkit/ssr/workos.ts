import { WorkOS } from '@workos-inc/node'
import { getConfig } from './config'
import { lazy } from './utils'

function createWorkOSInstance(): WorkOS {
  const apiKey = getConfig('apiKey')
  const apiHostname = getConfig('apiHostname')
  const https = getConfig('https')

  return new WorkOS(apiKey, {
    apiHostname,
    https,
  })
}

// Lazy load the WorkOS instance to avoid initialization until needed
export const getWorkOS = lazy(createWorkOSInstance)
