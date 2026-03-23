import type { OverlayAPI } from './index'

declare global {
  interface Window {
    api: OverlayAPI
  }
}
