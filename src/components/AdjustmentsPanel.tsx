import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../lib/locale'

export type AdjustmentCommand =
  | { type: 'brightness-contrast'; brightness: number; contrast: number }
  | { type: 'exposure'; exposure: number }
  | { type: 'hue-saturation'; hue: number; saturation: number; lightness: number }
  | { type: 'vibrance'; vibrance: number }
  | {
      type: 'levels'
      inBlack: number
      inWhite: number
      gamma: number
      outBlack: number
      outWhite: number
    }
  | { type: 'curves'; points: [number, number][] }
  | { type: 'white-balance'; temperature: number; tint: number }
  | { type: 'sharpen'; amount: number; radius: number; threshold: number }
  | { type: 'denoise'; strength: number }

interface AdjustmentsPanelProps {
  tabId: string | null
  isLoading: boolean
  onApply: (cmd: AdjustmentCommand) => Promise<void>
  onPreviewFilterChange: (filter: string | null) => void
  onReset?: () => void
  canReset?: boolean
}

// ─── Curve LUT ───────────────────────────────────────────────────────────────

function computeCurveLut(raw: [number, number][]): number[] {
  let pts = [...raw].sort((a, b) => a[0] - b[0])
  if (pts.length === 0 || pts[0][0] > 0.001) pts = [[0, 0], ...pts]
  if (pts[pts.length - 1][0] < 0.999) pts = [...pts, [1, 1]]
  const n = pts.length
  if (n < 2) return Array.from({ length: 256 }, (_, i) => i)
  const delta: number[] = []
  for (let k = 0; k < n - 1; k++) {
    const dx = pts[k + 1][0] - pts[k][0]
    delta.push(dx < 1e-9 ? 0 : (pts[k + 1][1] - pts[k][1]) / dx)
  }
  const m = new Array<number>(n)
  m[0] = delta[0]
  m[n - 1] = delta[n - 2]
  for (let k = 1; k < n - 1; k++) m[k] = (delta[k - 1] + delta[k]) / 2
  for (let k = 0; k < n - 1; k++) {
    if (Math.abs(delta[k]) < 1e-9) {
      m[k] = 0
      m[k + 1] = 0
    } else {
      const a = m[k] / delta[k],
        b = m[k + 1] / delta[k],
        sq = a * a + b * b
      if (sq > 9) {
        const t = 3 / Math.sqrt(sq)
        m[k] = t * a * delta[k]
        m[k + 1] = t * b * delta[k]
      }
    }
  }
  return Array.from({ length: 256 }, (_, i) => {
    const x = i / 255
    let seg = 0
    for (let k = 0; k < n - 1; k++) {
      if (x >= pts[k][0]) seg = k
    }
    const h = pts[seg + 1][0] - pts[seg][0]
    const t = h < 1e-9 ? 0 : Math.max(0, Math.min(1, (x - pts[seg][0]) / h))
    const t2 = t * t,
      t3 = t2 * t
    const y =
      (2 * t3 - 3 * t2 + 1) * pts[seg][1] +
      (t3 - 2 * t2 + t) * h * m[seg] +
      (-2 * t3 + 3 * t2) * pts[seg + 1][1] +
      (t3 - t2) * h * m[seg + 1]
    return Math.max(0, Math.min(255, Math.round(y * 255)))
  })
}

// ─── Curves canvas ───────────────────────────────────────────────────────────

const CW = 200,
  CH = 200,
  HIT_R = 9

function ptToCanvas(px: number, py: number): [number, number] {
  return [px * CW, CH - py * CH]
}
function canvasToPt(cx: number, cy: number): [number, number] {
  return [Math.max(0, Math.min(1, cx / CW)), Math.max(0, Math.min(1, 1 - cy / CH))]
}
function findNearest(cx: number, cy: number, pts: [number, number][]): number {
  for (let i = 0; i < pts.length; i++) {
    const [pcx, pcy] = ptToCanvas(pts[i][0], pts[i][1])
    if (Math.hypot(cx - pcx, cy - pcy) <= HIT_R) return i
  }
  return -1
}

function CurvesEditor({
  userPoints,
  onChange,
  onCommit,
}: {
  userPoints: [number, number][]
  onChange: (pts: [number, number][]) => void
  onCommit: (pts: [number, number][]) => void
}) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragIdxRef = useRef<number | null>(null)
  const ptsRef = useRef(userPoints)
  useEffect(() => {
    ptsRef.current = userPoints
  }, [userPoints])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CW, CH)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, CW, CH)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo((CW * i) / 4, 0)
      ctx.lineTo((CW * i) / 4, CH)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, (CH * i) / 4)
      ctx.lineTo(CW, (CH * i) / 4)
      ctx.stroke()
    }
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, CH)
    ctx.lineTo(CW, 0)
    ctx.stroke()
    const lut = computeCurveLut(userPoints)
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * CW,
        y = CH - (lut[i] / 255) * CH
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    for (const [px, py] of userPoints) {
      const [cx, cy] = ptToCanvas(px, py)
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#818cf8'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }, [userPoints])

  const clientToCanvas = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect()
    return [
      Math.max(0, Math.min(CW, (e.clientX - rect.left) * (CW / rect.width))),
      Math.max(0, Math.min(CH, (e.clientY - rect.top) * (CH / rect.height))),
    ]
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const [cx, cy] = clientToCanvas(e)
    const pts = ptsRef.current
    const idx = findNearest(cx, cy, pts)
    if (idx >= 0) {
      dragIdxRef.current = idx
      return
    }
    if (pts.length >= 10) return
    const newPt = canvasToPt(cx, cy)
    const newPts: [number, number][] = [...pts, newPt].sort((a, b) => a[0] - b[0])
    dragIdxRef.current = newPts.findIndex(
      (p) => Math.abs(p[0] - newPt[0]) < 0.001 && Math.abs(p[1] - newPt[1]) < 0.001,
    )
    ptsRef.current = newPts
    onChange(newPts)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = dragIdxRef.current
    if (idx === null || idx < 0) return
    const [cx, cy] = clientToCanvas(e)
    const pts = [...ptsRef.current]
    pts[idx] = canvasToPt(cx, cy)
    ptsRef.current = pts
    onChange(pts)
  }

  const finalizeDrag = () => {
    if (dragIdxRef.current !== null) {
      const sorted: [number, number][] = [...ptsRef.current].sort((a, b) => a[0] - b[0])
      ptsRef.current = sorted
      onChange(sorted)
      onCommit(sorted)
    }
    dragIdxRef.current = null
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const [cx, cy] = clientToCanvas(e)
    const idx = findNearest(cx, cy, ptsRef.current)
    if (idx >= 0) {
      const newPts = ptsRef.current.filter((_, i) => i !== idx)
      ptsRef.current = newPts
      onChange(newPts)
      onCommit(newPts)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className="w-full rounded border border-slate-700 cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finalizeDrag}
        onMouseLeave={finalizeDrag}
        onContextMenu={handleContextMenu}
      />
      <p className="text-xs text-slate-600">{t('adj.curves-hint')}</p>
    </div>
  )
}

// ─── Slider ──────────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  disabled?: boolean
  onChange: (v: number) => void
  onCommit: (v: number) => void
}) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0
  const readValue = (e: React.SyntheticEvent<HTMLInputElement>) =>
    parseFloat((e.target as HTMLInputElement).value)

  return (
    <div className={`flex flex-col gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-300 tabular-nums">
          {value.toFixed(decimals)}
          {unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(readValue(e))}
        onPointerUp={(e) => {
          if (!disabled) onCommit(readValue(e))
        }}
        onKeyUp={(e) => {
          if (!disabled) onCommit(readValue(e))
        }}
        className={`w-full accent-indigo-500 ${disabled ? 'cursor-not-allowed' : ''}`}
        style={{ height: '4px' }}
      />
    </div>
  )
}

function Section({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-slate-800">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
      >
        <span className="font-medium">{title}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>}
    </div>
  )
}

// ─── Reset icon ──────────────────────────────────────────────────────────────

function ResetIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const BC_DEF = { brightness: 0, contrast: 0 }
const HSL_DEF = { hue: 0, saturation: 0, lightness: 0 }
const LEVELS_DEF = { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 }
const WB_DEF = { temperature: 0, tint: 0 }
const SHARPEN_DEF = { amount: 100, radius: 1.0, threshold: 0 }

// ─── Panel ───────────────────────────────────────────────────────────────────

export function AdjustmentsPanel({
  tabId,
  isLoading,
  onApply,
  onPreviewFilterChange,
  onReset,
  canReset = false,
}: AdjustmentsPanelProps) {
  const t = useT()
  const [open, setOpen] = useState<string | null>(null)

  // Display state (drives slider UI)
  const [bc, setBc] = useState(BC_DEF)
  const [exposure, setExposure] = useState(0)
  const [hsl, setHsl] = useState(HSL_DEF)
  const [vibrance, setVibrance] = useState(0)
  const [levels, setLevels] = useState(LEVELS_DEF)
  const [curvePoints, setCurvePoints] = useState<[number, number][]>([])
  const [wb, setWb] = useState(WB_DEF)
  const [sharpen, setSharpen] = useState(SHARPEN_DEF)
  const [denoise, setDenoise] = useState(0)

  // Refs mirror state for sync reads in event handlers
  const bcRef = useRef(BC_DEF)
  const hslRef = useRef(HSL_DEF)
  const levelsRef = useRef(LEVELS_DEF)
  const wbRef = useRef(WB_DEF)
  const sharpenRef = useRef(SHARPEN_DEF)

  // Overlay driven imperatively so it appears in the same frame as pointerUp,
  // without waiting for a React re-render (which would be too late).
  const overlayRef = useRef<HTMLDivElement>(null)
  const inFlightRef = useRef(false)
  const pendingRef = useRef<AdjustmentCommand | null>(null)

  const showOverlay = () => {
    if (overlayRef.current) overlayRef.current.style.display = 'block'
  }
  const hideOverlay = () => {
    if (overlayRef.current) overlayRef.current.style.display = 'none'
  }

  const commitToRust = useCallback(
    async (cmd: AdjustmentCommand) => {
      if (inFlightRef.current) {
        pendingRef.current = cmd
        return
      }
      inFlightRef.current = true
      showOverlay()
      try {
        await onApply(cmd)
        while (pendingRef.current) {
          const next = pendingRef.current
          pendingRef.current = null
          await onApply(next)
        }
      } finally {
        inFlightRef.current = false
        hideOverlay()
        onPreviewFilterChange(null)
      }
    },
    [onApply, onPreviewFilterChange],
  )

  const resetLocalState = useCallback(() => {
    setBc(BC_DEF)
    bcRef.current = BC_DEF
    setExposure(0)
    setHsl(HSL_DEF)
    hslRef.current = HSL_DEF
    setVibrance(0)
    setLevels(LEVELS_DEF)
    levelsRef.current = LEVELS_DEF
    setCurvePoints([])
    setWb(WB_DEF)
    wbRef.current = WB_DEF
    setSharpen(SHARPEN_DEF)
    sharpenRef.current = SHARPEN_DEF
    setDenoise(0)
    onPreviewFilterChange(null)
  }, [onPreviewFilterChange])

  const handleReset = useCallback(() => {
    resetLocalState()
    onReset?.()
  }, [resetLocalState, onReset])

  useEffect(() => {
    return () => {
      onPreviewFilterChange(null)
    }
  }, [tabId, onPreviewFilterChange])

  if (!tabId) return null

  const toggle = (id: string) => setOpen((p) => (p === id ? null : id))

  return (
    <aside className="w-72 bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden shrink-0">
      <div className="border-b border-slate-700 shrink-0">
        <div className="px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {t('adj.header')}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {onReset && (
              <button
                onClick={handleReset}
                disabled={!canReset || isLoading}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={t('adj.reset')}
                aria-label={t('adj.reset')}
              >
                <ResetIcon />
              </button>
            )}
            {isLoading && (
              <svg className="animate-spin h-3 w-3 text-indigo-400" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            )}
          </div>
        </div>
        {isLoading && <div className="h-0.5 bg-indigo-600 animate-pulse" />}
      </div>

      <div className="overflow-y-auto flex-1 relative">
        {/* Always in DOM, shown/hidden imperatively to avoid React re-render lag */}
        <div
          ref={overlayRef}
          className="absolute inset-0 z-10 bg-slate-900/60 cursor-wait"
          style={{ display: isLoading ? 'block' : 'none' }}
        />

        <Section
          id="bc"
          title={t('adj.brightness-contrast')}
          open={open === 'bc'}
          onToggle={toggle}
        >
          <Slider
            label={t('adj.brightness')}
            value={bc.brightness}
            min={-100}
            max={100}
            step={1}
            onChange={(v) => {
              const next = { ...bcRef.current, brightness: v }
              bcRef.current = next
              setBc(next)
              const f =
                next.brightness === 0 && next.contrast === 0
                  ? null
                  : `brightness(${((next.brightness + 100) / 100).toFixed(3)}) contrast(${((next.contrast + 100) / 100).toFixed(3)})`
              onPreviewFilterChange(f)
            }}
            onCommit={() => commitToRust({ type: 'brightness-contrast', ...bcRef.current })}
          />
          <Slider
            label={t('adj.contrast')}
            value={bc.contrast}
            min={-100}
            max={100}
            step={1}
            onChange={(v) => {
              const next = { ...bcRef.current, contrast: v }
              bcRef.current = next
              setBc(next)
              const f =
                next.brightness === 0 && next.contrast === 0
                  ? null
                  : `brightness(${((next.brightness + 100) / 100).toFixed(3)}) contrast(${((next.contrast + 100) / 100).toFixed(3)})`
              onPreviewFilterChange(f)
            }}
            onCommit={() => commitToRust({ type: 'brightness-contrast', ...bcRef.current })}
          />
        </Section>

        <Section
          id="exposure"
          title={t('adj.exposure')}
          open={open === 'exposure'}
          onToggle={toggle}
        >
          <Slider
            label={t('adj.exposure-label')}
            value={exposure}
            min={-3}
            max={3}
            step={0.05}
            unit=" EV"
            onChange={(v) => {
              setExposure(v)
              onPreviewFilterChange(v === 0 ? null : `brightness(${Math.pow(2, v).toFixed(3)})`)
            }}
            onCommit={(v) => commitToRust({ type: 'exposure', exposure: v })}
          />
        </Section>

        <Section id="hsl" title={t('adj.hue-saturation')} open={open === 'hsl'} onToggle={toggle}>
          {(['hue', 'saturation', 'lightness'] as const).map((field) => (
            <Slider
              key={field}
              label={t(`adj.${field}`)}
              value={hsl[field]}
              min={field === 'hue' ? -180 : -100}
              max={field === 'hue' ? 180 : 100}
              step={1}
              unit={field === 'hue' ? '°' : undefined}
              onChange={(v) => {
                const next = { ...hslRef.current, [field]: v }
                hslRef.current = next
                setHsl(next)
                const f =
                  next.hue === 0 && next.saturation === 0 && next.lightness === 0
                    ? null
                    : `hue-rotate(${next.hue}deg) saturate(${((next.saturation + 100) / 100).toFixed(3)}) brightness(${((next.lightness + 100) / 100).toFixed(3)})`
                onPreviewFilterChange(f)
              }}
              onCommit={() => commitToRust({ type: 'hue-saturation', ...hslRef.current })}
            />
          ))}
        </Section>

        <Section
          id="vibrance"
          title={t('adj.vibrance')}
          open={open === 'vibrance'}
          onToggle={toggle}
        >
          <Slider
            label={t('adj.vibrance-label')}
            value={vibrance}
            min={-100}
            max={100}
            step={1}
            onChange={(v) => {
              setVibrance(v)
              onPreviewFilterChange(v === 0 ? null : `saturate(${((v + 100) / 100).toFixed(3)})`)
            }}
            onCommit={(v) => commitToRust({ type: 'vibrance', vibrance: v })}
          />
        </Section>

        <Section id="levels" title={t('adj.levels')} open={open === 'levels'} onToggle={toggle}>
          <Slider
            label={t('adj.in-black')}
            value={levels.inBlack}
            min={0}
            max={253}
            step={1}
            onChange={(v) => {
              const n = {
                ...levelsRef.current,
                inBlack: Math.min(v, levelsRef.current.inWhite - 2),
              }
              levelsRef.current = n
              setLevels(n)
            }}
            onCommit={() => commitToRust({ type: 'levels', ...levelsRef.current })}
          />
          <Slider
            label={t('adj.in-white')}
            value={levels.inWhite}
            min={2}
            max={255}
            step={1}
            onChange={(v) => {
              const n = {
                ...levelsRef.current,
                inWhite: Math.max(v, levelsRef.current.inBlack + 2),
              }
              levelsRef.current = n
              setLevels(n)
            }}
            onCommit={() => commitToRust({ type: 'levels', ...levelsRef.current })}
          />
          <Slider
            label={t('adj.gamma')}
            value={levels.gamma}
            min={0.1}
            max={10}
            step={0.05}
            onChange={(v) => {
              const n = { ...levelsRef.current, gamma: v }
              levelsRef.current = n
              setLevels(n)
            }}
            onCommit={() => commitToRust({ type: 'levels', ...levelsRef.current })}
          />
          <Slider
            label={t('adj.out-black')}
            value={levels.outBlack}
            min={0}
            max={255}
            step={1}
            onChange={(v) => {
              const n = {
                ...levelsRef.current,
                outBlack: Math.min(v, levelsRef.current.outWhite - 1),
              }
              levelsRef.current = n
              setLevels(n)
            }}
            onCommit={() => commitToRust({ type: 'levels', ...levelsRef.current })}
          />
          <Slider
            label={t('adj.out-white')}
            value={levels.outWhite}
            min={0}
            max={255}
            step={1}
            onChange={(v) => {
              const n = {
                ...levelsRef.current,
                outWhite: Math.max(v, levelsRef.current.outBlack + 1),
              }
              levelsRef.current = n
              setLevels(n)
            }}
            onCommit={() => commitToRust({ type: 'levels', ...levelsRef.current })}
          />
        </Section>

        <Section id="curves" title={t('adj.curves')} open={open === 'curves'} onToggle={toggle}>
          <CurvesEditor
            userPoints={curvePoints}
            onChange={setCurvePoints}
            onCommit={(pts) => commitToRust({ type: 'curves', points: pts })}
          />
        </Section>

        <Section id="wb" title={t('adj.white-balance')} open={open === 'wb'} onToggle={toggle}>
          <Slider
            label={t('adj.temperature')}
            value={wb.temperature}
            min={-100}
            max={100}
            step={1}
            onChange={(v) => {
              const n = { ...wbRef.current, temperature: v }
              wbRef.current = n
              setWb(n)
            }}
            onCommit={() => commitToRust({ type: 'white-balance', ...wbRef.current })}
          />
          <Slider
            label={t('adj.tint')}
            value={wb.tint}
            min={-100}
            max={100}
            step={1}
            onChange={(v) => {
              const n = { ...wbRef.current, tint: v }
              wbRef.current = n
              setWb(n)
            }}
            onCommit={() => commitToRust({ type: 'white-balance', ...wbRef.current })}
          />
        </Section>

        <Section id="sharpen" title={t('adj.sharpen')} open={open === 'sharpen'} onToggle={toggle}>
          <Slider
            label={t('adj.amount')}
            value={sharpen.amount}
            min={0}
            max={200}
            step={1}
            onChange={(v) => {
              const n = { ...sharpenRef.current, amount: v }
              sharpenRef.current = n
              setSharpen(n)
            }}
            onCommit={() => commitToRust({ type: 'sharpen', ...sharpenRef.current })}
          />
          <Slider
            label={t('adj.radius')}
            value={sharpen.radius}
            min={0.1}
            max={5}
            step={0.1}
            onChange={(v) => {
              const n = { ...sharpenRef.current, radius: v }
              sharpenRef.current = n
              setSharpen(n)
            }}
            onCommit={() => commitToRust({ type: 'sharpen', ...sharpenRef.current })}
          />
          <Slider
            label={t('adj.threshold')}
            value={sharpen.threshold}
            min={0}
            max={255}
            step={1}
            onChange={(v) => {
              const n = { ...sharpenRef.current, threshold: v }
              sharpenRef.current = n
              setSharpen(n)
            }}
            onCommit={() => commitToRust({ type: 'sharpen', ...sharpenRef.current })}
          />
        </Section>

        <Section id="denoise" title={t('adj.denoise')} open={open === 'denoise'} onToggle={toggle}>
          <Slider
            label={t('adj.strength')}
            value={denoise}
            min={0}
            max={100}
            step={1}
            onChange={(v) => {
              setDenoise(v)
              onPreviewFilterChange(v === 0 ? null : `blur(${(v / 100).toFixed(2)}px)`)
            }}
            onCommit={(v) => commitToRust({ type: 'denoise', strength: v })}
          />
        </Section>
      </div>
    </aside>
  )
}
