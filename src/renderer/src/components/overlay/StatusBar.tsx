import { useOverlayStore } from '@renderer/stores/overlay-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Button } from '@renderer/components/ui/button'
import { ChevronDown, Zap } from 'lucide-react'

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
]

export function StatusBar(): React.JSX.Element {
  const { currentModel, setModel } = useOverlayStore()
  const currentLabel = MODELS.find((m) => m.id === currentModel)?.label || currentModel

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/5 bg-white/[0.02]">
      <div className="flex items-center gap-1.5 text-[10px] text-white/40">
        <Zap className="h-3 w-3 text-green-400" />
        <span>OpenClaw</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-white/50 px-2">
            {currentLabel}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          {MODELS.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => setModel(model.id)}
              className={currentModel === model.id ? 'bg-accent' : ''}
            >
              {model.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
