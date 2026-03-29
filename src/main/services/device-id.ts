import Store from 'electron-store'
import crypto from 'crypto'

const store = new Store<{ deviceId: string }>({
  name: 'device-identity',
  defaults: {
    deviceId: ''
  }
})

export function getDeviceId(): string {
  let id = store.get('deviceId')
  if (!id) {
    id = crypto.randomUUID()
    store.set('deviceId', id)
  }
  return id
}
