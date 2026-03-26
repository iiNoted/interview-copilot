import { useOverlayStore } from '@renderer/stores/overlay-store'

export function PreparednessRing(): React.JSX.Element | null {
  const score = useOverlayStore((s) => s.preparednessScore)
  const chatCount = useOverlayStore((s) => s.spawnedChats.length)
  const questionCount = useOverlayStore((s) => s.detectedQuestions.filter((q) => q.response).length)

  if (chatCount === 0 && questionCount === 0) return null

  const size = 28
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const color =
    score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'
  const strokeColor =
    score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171'

  return (
    <div className="flex items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold ${color}`}
        >
          {score}
        </span>
      </div>
      <span className="text-[10px] text-white/30">
        {chatCount + questionCount} topics
      </span>
    </div>
  )
}
