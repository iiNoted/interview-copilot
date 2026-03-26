import { useState } from 'react'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { SubscriptionGate } from '@renderer/components/gates/SubscriptionGate'
import { TermsGate } from '@renderer/components/gates/TermsGate'
import { CopilotTab } from '@renderer/components/tabs/CopilotTab'
import { JobsTab } from '@renderer/components/tabs/JobsTab'
import { PrepTab } from '@renderer/components/tabs/PrepTab'
import { ResumeTab } from '@renderer/components/tabs/ResumeTab'
import { useT } from '@renderer/i18n/context'
import { Briefcase, BookOpen, FileText, Sparkles } from 'lucide-react'

const TAB_DEFS = [
  { id: 'prep', labelKey: 'app.tab.prep', icon: BookOpen },
  { id: 'jobs', labelKey: 'app.tab.jobs', icon: Briefcase },
  { id: 'resume', labelKey: 'app.tab.resume', icon: FileText },
  { id: 'copilot', labelKey: 'app.tab.copilot', icon: Sparkles }
] as const

type TabId = (typeof TAB_DEFS)[number]['id']

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('prep')
  const { t, dir } = useT()

  return (
    <TooltipProvider>
      <TermsGate>
      <SubscriptionGate>
      <div className="h-screen flex flex-col bg-[hsl(220,20%,6%)] text-white" dir={dir}>
        {/* Title bar drag region for macOS hiddenInset */}
        <div
          className="h-10 flex items-center shrink-0 border-b border-white/5"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="ps-20 pe-4 flex items-center gap-1">
            <span className="text-xs font-bold tracking-wide text-white/50">
              {t('app.title')}
            </span>
          </div>

          {/* Tab navigation — not draggable */}
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}
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
          {activeTab === 'prep' && <PrepTab />}
          {activeTab === 'resume' && <ResumeTab />}
          {activeTab === 'copilot' && <CopilotTab />}
        </div>
      </div>
      </SubscriptionGate>
      </TermsGate>
    </TooltipProvider>
  )
}

export default App
