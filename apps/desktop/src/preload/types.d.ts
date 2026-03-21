import type { EmoryApi } from './index.js'

declare global {
  interface Window {
    emoryApi: EmoryApi
  }
}
