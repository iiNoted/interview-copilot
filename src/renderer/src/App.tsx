import { OverlayContainer } from '@renderer/components/overlay/OverlayContainer'
import { TooltipProvider } from '@renderer/components/ui/tooltip'

function App(): React.JSX.Element {
  return (
    <TooltipProvider>
      <OverlayContainer />
    </TooltipProvider>
  )
}

export default App
