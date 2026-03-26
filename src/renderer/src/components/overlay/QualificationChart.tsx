/**
 * QualificationChart — SVG radar/spider chart showing JD qualification coverage
 */
import { useMemo } from 'react'

interface QualificationData {
  keyword: string
  displayName: string
  coverageScore: number // 0-100
  resumeMatch: boolean
  category: string
}

interface Props {
  qualifications: QualificationData[]
  onClickAxis?: (qual: QualificationData) => void
  size?: number
}

export function QualificationChart({ qualifications, onClickAxis, size = 280 }: Props): React.JSX.Element {
  const count = qualifications.length
  const cx = size / 2
  const cy = size / 2
  const maxRadius = size / 2 - 40

  // Compute polygon points for a given radius per axis
  const getPoints = useMemo(() => {
    return (values: number[]): string => {
      return values
        .map((val, i) => {
          const angle = (Math.PI * 2 * i) / count - Math.PI / 2
          const r = (val / 100) * maxRadius
          return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
        })
        .join(' ')
    }
  }, [count, cx, cy, maxRadius])

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [25, 50, 75, 100]

  // Axis lines
  const axes = useMemo(() => {
    return qualifications.map((_, i) => {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2
      return {
        x: cx + maxRadius * Math.cos(angle),
        y: cy + maxRadius * Math.sin(angle),
        labelX: cx + (maxRadius + 22) * Math.cos(angle),
        labelY: cy + (maxRadius + 22) * Math.sin(angle),
        angle
      }
    })
  }, [count, cx, cy, maxRadius, qualifications])

  // Data polygon
  const dataValues = qualifications.map((q) => q.coverageScore)
  const dataPoints = getPoints(dataValues)

  // Color based on score
  function scoreColor(score: number): string {
    if (score >= 60) return 'rgba(34, 197, 94, 0.6)' // green
    if (score >= 30) return 'rgba(234, 179, 8, 0.6)' // yellow
    return 'rgba(239, 68, 68, 0.6)' // red
  }

  function scoreFill(score: number): string {
    if (score >= 60) return 'rgba(34, 197, 94, 0.15)'
    if (score >= 30) return 'rgba(234, 179, 8, 0.15)'
    return 'rgba(239, 68, 68, 0.15)'
  }

  if (count < 3) {
    return <div className="text-xs text-white/30 text-center py-4">Need at least 3 matching qualifications</div>
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ maxWidth: size }}>
      {/* Grid rings */}
      {rings.map((pct) => {
        const r = (pct / 100) * maxRadius
        const ringPoints = qualifications
          .map((_, i) => {
            const angle = (Math.PI * 2 * i) / count - Math.PI / 2
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
          })
          .join(' ')
        return (
          <polygon
            key={pct}
            points={ringPoints}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.5"
          />
        )
      })}

      {/* Axis lines */}
      {axes.map((axis, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={axis.x}
          y2={axis.y}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.5"
        />
      ))}

      {/* Data fill */}
      <polygon points={dataPoints} fill={scoreFill(Math.min(...dataValues))} stroke="none" />

      {/* Data outline */}
      <polygon
        points={dataPoints}
        fill="none"
        stroke="rgba(96, 165, 250, 0.7)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Data points + axis labels */}
      {qualifications.map((qual, i) => {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2
        const r = (qual.coverageScore / 100) * maxRadius
        const px = cx + r * Math.cos(angle)
        const py = cy + r * Math.sin(angle)
        const color = scoreColor(qual.coverageScore)

        // Label positioning
        const labelR = maxRadius + 18
        const lx = cx + labelR * Math.cos(angle)
        const ly = cy + labelR * Math.sin(angle)
        const isRight = Math.cos(angle) > 0.1
        const isLeft = Math.cos(angle) < -0.1
        const anchor = isRight ? 'start' : isLeft ? 'end' : 'middle'

        // Truncate long names
        const label = qual.displayName.length > 16
          ? qual.displayName.slice(0, 14) + '...'
          : qual.displayName

        return (
          <g key={i}>
            {/* Data point */}
            <circle cx={px} cy={py} r="3" fill={color} stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />

            {/* Score text on point */}
            <text
              x={px}
              y={py - 6}
              textAnchor="middle"
              fill="rgba(255,255,255,0.5)"
              fontSize="7"
              fontWeight="500"
            >
              {qual.coverageScore}
            </text>

            {/* Label (clickable) */}
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              fill={qual.resumeMatch ? 'rgba(96, 165, 250, 0.8)' : 'rgba(255,255,255,0.5)'}
              fontSize="8"
              fontWeight={qual.resumeMatch ? '600' : '400'}
              className="cursor-pointer hover:fill-white"
              onClick={() => onClickAxis?.(qual)}
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
