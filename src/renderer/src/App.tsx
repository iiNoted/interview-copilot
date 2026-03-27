import { useState, useEffect, createContext, useContext } from 'react'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { SubscriptionGate } from '@renderer/components/gates/SubscriptionGate'
import { TermsGate } from '@renderer/components/gates/TermsGate'
import { CopilotTab } from '@renderer/components/tabs/CopilotTab'
import { JobsTab } from '@renderer/components/tabs/JobsTab'
import { FlashcardsTab } from '@renderer/components/tabs/FlashcardsTab'
import { ResumeTab } from '@renderer/components/tabs/ResumeTab'
import { useT } from '@renderer/i18n/context'
import { Briefcase, GraduationCap, FileText, Sparkles } from 'lucide-react'
import { getTheme, applyTheme, DEFAULT_THEME, type ProductTheme } from '@renderer/lib/product-theme'

// Theme context so any component can access current product theme
const ThemeContext = createContext<ProductTheme>(DEFAULT_THEME)
export const useProductTheme = (): ProductTheme => useContext(ThemeContext)

const TAB_DEFS = [
  { id: 'prep', labelKey: 'app.tab.prep', icon: GraduationCap },
  { id: 'jobs', labelKey: 'app.tab.jobs', icon: Briefcase },
  { id: 'resume', labelKey: 'app.tab.resume', icon: FileText },
  { id: 'copilot', labelKey: 'app.tab.copilot', icon: Sparkles }
] as const

type TabId = (typeof TAB_DEFS)[number]['id']

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('prep')
  const [theme, setTheme] = useState<ProductTheme>(DEFAULT_THEME)
  const { t, dir } = useT()

  // Load product theme on mount
  useEffect(() => {
    window.api.getProductName().then((name: string) => {
      const th = getTheme(name)
      setTheme(th)
      applyTheme(th)
    }).catch(() => {
      applyTheme(DEFAULT_THEME)
    })
  }, [])

  // Tab style classes based on theme
  const getTabClasses = (isActive: boolean): string => {
    const base = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all'
    switch (theme.tabStyle) {
      case 'underline':
        return `${base} border-b-2 rounded-none ${
          isActive
            ? 'border-[var(--color-primary)] text-white'
            : 'border-transparent text-white/40 hover:text-white/60'
        }`
      case 'block':
        return `${base} rounded-[var(--radius-base)] ${
          isActive
            ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
            : 'text-white/40 hover:text-white/60 hover:bg-white/5'
        }`
      case 'minimal':
        return `${base} rounded-sm ${
          isActive
            ? 'text-white bg-transparent border-b border-white/20'
            : 'text-white/30 hover:text-white/50'
        }`
      case 'pill':
      default:
        return `${base} rounded-md ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/40 hover:text-white/60 hover:bg-white/5'
        }`
    }
  }

  return (
    <ThemeContext.Provider value={theme}>
    <TooltipProvider>
      <TermsGate>
      <SubscriptionGate>
      <div className="h-screen flex flex-col bg-[var(--color-bg-base)] text-[var(--color-text-primary)]" dir={dir}>
        {/* Title bar drag region */}
        <div
          className="h-10 flex items-center shrink-0 border-b border-[var(--color-border)]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="ps-20 pe-4 flex items-center gap-1">
            <span className="text-xs font-bold tracking-wide text-[var(--color-text-muted)]">
              {theme.name}
            </span>
          </div>

          {/* Tab navigation */}
          <div
            className="flex items-center gap-0.5 ms-4"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {TAB_DEFS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={getTabClasses(isActive)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(tab.labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === 'jobs' && <JobsTab />}
          {activeTab === 'prep' && <FlashcardsTab />}
          {activeTab === 'resume' && <ResumeTab />}
          {activeTab === 'copilot' && <CopilotTab />}
        </div>
      </div>
      </SubscriptionGate>
      </TermsGate>
    </TooltipProvider>
    </ThemeContext.Provider>
  )
}

export default App
