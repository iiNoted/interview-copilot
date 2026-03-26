import './assets/main.css'

import { createRoot } from 'react-dom/client'
import { LocaleProvider } from './i18n/context'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>
)
