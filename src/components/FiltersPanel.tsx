import { useCallback, useRef, useState } from 'react'
import type { ImageMeta } from '../types'
import { useT } from '../lib/locale'

export type FilterCommand =
  | { type: 'grayscale'; rWeight: number; gWeight: number; bWeight: number }
  | { type: 'sepia'; intensity: number }
  | { type: 'invert' }
  | { type: 'vignette'; strength: number; feather: number }
  | { type: 'grain'; amount: number; monochrome: boolean }
  | { type: 'pixelate'; size: number }
  | { type: 'posterize'; levels: number }
  | {
      type: 'duotone'
      shadowR: number
      shadowG: number
      shadowB: number
      highlightR: number
      highlightG: number
      highlightB: number
    }
  | { type: 'sketch' }
  | { type: 'lomo'; intensity: number }
  | { type: 'vintage'; intensity: number }
  | { type: 'cool'; intensity: number }
  | { type: 'warm'; intensity: number }
  | { type: 'fade'; intensity: number }
  | { type: 'drama'; intensity: number }
  | { type: 'cross-process'; intensity: number }
  | { type: 'blur-gaussian'; radius: number }
  | { type: 'blur-motion'; angle: number; distance: number }
  | { type: 'blur-radial'; strength: number; samples: number }

interface FiltersPanelProps {
  tabId: string | null
  image: ImageMeta | null
  isLoading: boolean
  onApply: (cmd: FilterCommand) => Promise<void>
  onPreviewFilterChange: (filter: string | null) => void
  onReset?: () => void
  canReset?: boolean
}

// ── Preset definitions ────────────────────────────────────────────────────────

interface Preset {
  id: string
  nameKey: string
  css: string
  cmd: FilterCommand
}

const PRESETS: Preset[] = [
  {
    id: 'grayscale',
    nameKey: 'fil.preset.bw',
    css: 'grayscale(1)',
    cmd: { type: 'grayscale', rWeight: 0.299, gWeight: 0.587, bWeight: 0.114 },
  },
  {
    id: 'sepia',
    nameKey: 'fil.preset.sepia',
    css: 'sepia(1)',
    cmd: { type: 'sepia', intensity: 1.0 },
  },
  { id: 'invert', nameKey: 'fil.preset.invert', css: 'invert(1)', cmd: { type: 'invert' } },
  {
    id: 'lomo',
    nameKey: 'fil.preset.lomo',
    css: 'saturate(1.6) contrast(1.2) brightness(0.88)',
    cmd: { type: 'lomo', intensity: 1.0 },
  },
  {
    id: 'vintage',
    nameKey: 'fil.preset.vintage',
    css: 'sepia(0.4) contrast(0.9) brightness(1.05) saturate(0.85)',
    cmd: { type: 'vintage', intensity: 1.0 },
  },
  {
    id: 'cool',
    nameKey: 'fil.preset.cool',
    css: 'hue-rotate(20deg) saturate(1.15) brightness(1.05)',
    cmd: { type: 'cool', intensity: 1.0 },
  },
  {
    id: 'warm',
    nameKey: 'fil.preset.warm',
    css: 'hue-rotate(-15deg) saturate(1.2) brightness(1.05)',
    cmd: { type: 'warm', intensity: 1.0 },
  },
  {
    id: 'fade',
    nameKey: 'fil.preset.fade',
    css: 'contrast(0.7) brightness(1.2) saturate(0.8)',
    cmd: { type: 'fade', intensity: 1.0 },
  },
  {
    id: 'drama',
    nameKey: 'fil.preset.drama',
    css: 'contrast(1.5) brightness(0.85) saturate(0.7)',
    cmd: { type: 'drama', intensity: 1.0 },
  },
  {
    id: 'cross',
    nameKey: 'fil.preset.cross',
    css: 'saturate(1.5) hue-rotate(15deg) contrast(1.1)',
    cmd: { type: 'cross-process', intensity: 1.0 },
  },
  {
    id: 'sketch',
    nameKey: 'fil.preset.sketch',
    css: 'grayscale(1) contrast(4) brightness(1.5)',
    cmd: { type: 'sketch' },
  },
]

// ── Duotone presets ───────────────────────────────────────────────────────────

interface DuotonePair {
  name: string
  shadow: [number, number, number]
  highlight: [number, number, number]
}

const DUOTONE_PAIRS: DuotonePair[] = [
  { name: 'Gold / Teal', shadow: [60, 20, 0], highlight: [200, 230, 120] },
  { name: 'Purple / Yellow', shadow: [80, 0, 120], highlight: [250, 220, 0] },
  { name: 'Cyan / Red', shadow: [0, 80, 140], highlight: [220, 40, 20] },
  { name: 'Navy / Peach', shadow: [10, 20, 80], highlight: [255, 180, 120] },
  { name: 'Forest / Sun', shadow: [20, 60, 20], highlight: [255, 220, 80] },
  { name: 'Noir / Blanc', shadow: [20, 20, 20], highlight: [240, 240, 240] },
]

// ── Slider ────────────────────────────────────────────────────────────────────

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
  onCommit: (v: number) => void
}

function Slider({ label, value, min, max, step, unit = '', onChange, onCommit }: SliderProps) {
  const display = Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-300">
          {display}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="w-full h-1 accent-indigo-500 cursor-pointer"
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
      />
    </div>
  )
}

// ── Reset icon ────────────────────────────────────────────────────────────────

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

// ── Section accordion ─────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ title, open, onToggle, children }: SectionProps) {
  return (
    <div className="border-t border-slate-700/60">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/40 transition-colors"
      >
        <span>{title}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FiltersPanel({
  tabId,
  image,
  isLoading,
  onApply,
  onPreviewFilterChange,
  onReset,
  canReset = false,
}: FiltersPanelProps) {
  const t = useT()
  const [openSection, setOpenSection] = useState<string | null>(null)

  // Grayscale channel mixer state
  const [gR, setGR] = useState(0.299)
  const [gG, setGG] = useState(0.587)
  const [gB, setGB] = useState(0.114)
  const gRef = useRef({ r: 0.299, g: 0.587, b: 0.114 })

  // Vignette state
  const [vigStrength, setVigStrength] = useState(0.7)
  const [vigFeather, setVigFeather] = useState(0.5)
  const vigRef = useRef({ strength: 0.7, feather: 0.5 })

  // Grain state
  const [grainAmount, setGrainAmount] = useState(0.3)
  const [grainMono, setGrainMono] = useState(true)
  const grainRef = useRef({ amount: 0.3, monochrome: true })

  // Pixelate state
  const [pixelSize, setPixelSize] = useState(10)
  const pixelRef = useRef(10)

  // Posterize state
  const [posterLevels, setPosterLevels] = useState(4)
  const posterRef = useRef(4)

  // Sepia state
  const [sepiaIntensity, setSepiaIntensity] = useState(1.0)
  const sepiaRef = useRef(1.0)

  // Lomo state
  const [lomoIntensity, setLomoIntensity] = useState(1.0)
  const lomoRef = useRef(1.0)

  // Vintage state
  const [vintageIntensity, setVintageIntensity] = useState(1.0)
  const vintageRef = useRef(1.0)

  // Cool state
  const [coolIntensity, setCoolIntensity] = useState(1.0)
  const coolRef = useRef(1.0)

  // Warm state
  const [warmIntensity, setWarmIntensity] = useState(1.0)
  const warmRef = useRef(1.0)

  // Fade state
  const [fadeIntensity, setFadeIntensity] = useState(1.0)
  const fadeRef = useRef(1.0)

  // Drama state
  const [dramaIntensity, setDramaIntensity] = useState(1.0)
  const dramaRef = useRef(1.0)

  // Cross-process state
  const [crossIntensity, setCrossIntensity] = useState(1.0)
  const crossRef = useRef(1.0)

  // Blur state
  const [blurType, setBlurType] = useState<'gaussian' | 'motion' | 'radial'>('gaussian')
  const [blurRadius, setBlurRadius] = useState(3)
  const [blurAngle, setBlurAngle] = useState(0)
  const [blurDistance, setBlurDistance] = useState(10)
  const [blurStrength, setBlurStrength] = useState(0.3)
  const [blurSamples, setBlurSamples] = useState(12)
  const blurRef = useRef({
    type: 'gaussian' as 'gaussian' | 'motion' | 'radial',
    radius: 3,
    angle: 0,
    distance: 10,
    strength: 0.3,
    samples: 12,
  })

  const commitBlur = () => {
    const b = blurRef.current
    if (b.type === 'gaussian') commitToRust({ type: 'blur-gaussian', radius: b.radius })
    else if (b.type === 'motion')
      commitToRust({ type: 'blur-motion', angle: b.angle, distance: b.distance })
    else commitToRust({ type: 'blur-radial', strength: b.strength, samples: b.samples })
  }

  // In-flight queue
  const inFlightRef = useRef(false)
  const pendingRef = useRef<FilterCommand | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const showOverlay = () => {
    if (overlayRef.current) overlayRef.current.style.display = 'flex'
  }
  const hideOverlay = () => {
    if (overlayRef.current) overlayRef.current.style.display = 'none'
  }

  const commitToRust = useCallback(
    async (cmd: FilterCommand) => {
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

  const toggleSection = (name: string) => setOpenSection((s) => (s === name ? null : name))

  if (!tabId) return null

  return (
    <div className="w-64 shrink-0 bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden relative">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-slate-900/60 z-10 flex items-center justify-center"
        style={{ display: isLoading ? 'flex' : 'none' }}
      >
        <svg className="animate-spin w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-700 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">{t('fil.header')}</span>
          <div className="flex items-center gap-1.5">
            {onReset && (
              <button
                onClick={onReset}
                disabled={!canReset || isLoading}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={t('adj.reset')}
                aria-label={t('adj.reset')}
              >
                <ResetIcon />
              </button>
            )}
            {isLoading && (
              <svg
                className="animate-spin w-3.5 h-3.5 text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
          </div>
        </div>
        {isLoading && <div className="mt-1.5 h-0.5 bg-indigo-500/30 rounded animate-pulse" />}
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Preset grid */}
        <div className="grid grid-cols-3 gap-1.5 p-2">
          {PRESETS.map((preset) => {
            const presetName = t(preset.nameKey)
            return (
              <button
                key={preset.id}
                className="flex flex-col items-center gap-1 p-1 rounded hover:bg-slate-700/50 transition-colors group"
                onClick={() => commitToRust(preset.cmd)}
                title={presetName}
              >
                <div className="w-full aspect-video overflow-hidden rounded-sm bg-slate-800">
                  {image ? (
                    <img
                      src={image.preview}
                      alt={presetName}
                      className="w-full h-full object-cover"
                      style={{ filter: preset.css, imageRendering: 'auto' }}
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-700/50" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-200 transition-colors leading-none">
                  {presetName}
                </span>
              </button>
            )
          })}
        </div>

        {/* Parametric sections */}
        <Section
          title={t('fil.sec.bw-mixer')}
          open={openSection === 'grayscale'}
          onToggle={() => toggleSection('grayscale')}
        >
          <Slider
            label={t('fil.red')}
            value={gR}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setGR(v)
              gRef.current.r = v
              onPreviewFilterChange('grayscale(1)')
            }}
            onCommit={() =>
              commitToRust({
                type: 'grayscale',
                rWeight: gRef.current.r,
                gWeight: gRef.current.g,
                bWeight: gRef.current.b,
              })
            }
          />
          <Slider
            label={t('fil.green')}
            value={gG}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setGG(v)
              gRef.current.g = v
              onPreviewFilterChange('grayscale(1)')
            }}
            onCommit={() =>
              commitToRust({
                type: 'grayscale',
                rWeight: gRef.current.r,
                gWeight: gRef.current.g,
                bWeight: gRef.current.b,
              })
            }
          />
          <Slider
            label={t('fil.blue')}
            value={gB}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setGB(v)
              gRef.current.b = v
              onPreviewFilterChange('grayscale(1)')
            }}
            onCommit={() =>
              commitToRust({
                type: 'grayscale',
                rWeight: gRef.current.r,
                gWeight: gRef.current.g,
                bWeight: gRef.current.b,
              })
            }
          />
        </Section>

        <Section
          title={t('fil.sec.vignette')}
          open={openSection === 'vignette'}
          onToggle={() => toggleSection('vignette')}
        >
          <Slider
            label={t('fil.strength')}
            value={vigStrength}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setVigStrength(v)
              vigRef.current.strength = v
            }}
            onCommit={() =>
              commitToRust({
                type: 'vignette',
                strength: vigRef.current.strength,
                feather: vigRef.current.feather,
              })
            }
          />
          <Slider
            label={t('fil.feather')}
            value={vigFeather}
            min={0.05}
            max={1}
            step={0.01}
            onChange={(v) => {
              setVigFeather(v)
              vigRef.current.feather = v
            }}
            onCommit={() =>
              commitToRust({
                type: 'vignette',
                strength: vigRef.current.strength,
                feather: vigRef.current.feather,
              })
            }
          />
        </Section>

        <Section
          title={t('fil.sec.grain')}
          open={openSection === 'grain'}
          onToggle={() => toggleSection('grain')}
        >
          <Slider
            label={t('fil.intensity')}
            value={grainAmount}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setGrainAmount(v)
              grainRef.current.amount = v
            }}
            onCommit={() =>
              commitToRust({
                type: 'grain',
                amount: grainRef.current.amount,
                monochrome: grainRef.current.monochrome,
              })
            }
          />
          <div className="flex items-center gap-2 px-3 py-1.5">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={grainMono}
                className="accent-indigo-500 w-3.5 h-3.5"
                onChange={(e) => {
                  const v = e.target.checked
                  setGrainMono(v)
                  grainRef.current.monochrome = v
                  commitToRust({ type: 'grain', amount: grainRef.current.amount, monochrome: v })
                }}
              />
              {t('fil.monochrome')}
            </label>
          </div>
        </Section>

        <Section
          title={t('fil.sec.pixelate')}
          open={openSection === 'pixelate'}
          onToggle={() => toggleSection('pixelate')}
        >
          <Slider
            label={t('fil.size')}
            value={pixelSize}
            min={2}
            max={100}
            step={1}
            unit="px"
            onChange={(v) => {
              setPixelSize(v)
              pixelRef.current = v
            }}
            onCommit={() => commitToRust({ type: 'pixelate', size: pixelRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.posterize')}
          open={openSection === 'posterize'}
          onToggle={() => toggleSection('posterize')}
        >
          <Slider
            label={t('fil.levels')}
            value={posterLevels}
            min={2}
            max={16}
            step={1}
            onChange={(v) => {
              setPosterLevels(v)
              posterRef.current = v
            }}
            onCommit={() => commitToRust({ type: 'posterize', levels: posterRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.blur')}
          open={openSection === 'blur'}
          onToggle={() => toggleSection('blur')}
        >
          {/* Type switcher */}
          <div className="flex gap-1 px-3 pt-1 pb-0.5">
            {(['gaussian', 'motion', 'radial'] as const).map((bt) => (
              <button
                key={bt}
                onClick={() => {
                  setBlurType(bt)
                  blurRef.current.type = bt
                }}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${blurType === bt ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
              >
                {t(`fil.blur.${bt}`)}
              </button>
            ))}
          </div>

          {blurType === 'gaussian' && (
            <Slider
              label={t('fil.radius')}
              value={blurRadius}
              min={0.5}
              max={30}
              step={0.5}
              unit="px"
              onChange={(v) => {
                setBlurRadius(v)
                blurRef.current.radius = v
                onPreviewFilterChange(`blur(${v.toFixed(1)}px)`)
              }}
              onCommit={commitBlur}
            />
          )}

          {blurType === 'motion' && (
            <>
              <Slider
                label={t('fil.angle')}
                value={blurAngle}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={(v) => {
                  setBlurAngle(v)
                  blurRef.current.angle = v
                  onPreviewFilterChange(`blur(2px)`)
                }}
                onCommit={commitBlur}
              />
              <Slider
                label={t('fil.distance')}
                value={blurDistance}
                min={1}
                max={50}
                step={1}
                unit="px"
                onChange={(v) => {
                  setBlurDistance(v)
                  blurRef.current.distance = v
                  onPreviewFilterChange(`blur(${(v / 5).toFixed(1)}px)`)
                }}
                onCommit={commitBlur}
              />
            </>
          )}

          {blurType === 'radial' && (
            <>
              <Slider
                label={t('fil.strength')}
                value={blurStrength}
                min={0}
                max={0.95}
                step={0.01}
                onChange={(v) => {
                  setBlurStrength(v)
                  blurRef.current.strength = v
                  onPreviewFilterChange(`blur(${(v * 5).toFixed(1)}px)`)
                }}
                onCommit={commitBlur}
              />
              <Slider
                label={t('fil.samples')}
                value={blurSamples}
                min={4}
                max={32}
                step={1}
                onChange={(v) => {
                  setBlurSamples(v)
                  blurRef.current.samples = v
                }}
                onCommit={commitBlur}
              />
            </>
          )}
        </Section>

        <Section
          title={t('fil.sec.sepia')}
          open={openSection === 'sepia'}
          onToggle={() => toggleSection('sepia')}
        >
          <Slider
            label={t('fil.intensity')}
            value={sepiaIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setSepiaIntensity(v)
              sepiaRef.current = v
              onPreviewFilterChange(`sepia(${v.toFixed(2)})`)
            }}
            onCommit={() => commitToRust({ type: 'sepia', intensity: sepiaRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.lomo')}
          open={openSection === 'lomo'}
          onToggle={() => toggleSection('lomo')}
        >
          <Slider
            label={t('fil.intensity')}
            value={lomoIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setLomoIntensity(v)
              lomoRef.current = v
              onPreviewFilterChange(
                `saturate(${1 + v * 0.6}) contrast(${1 + v * 0.2}) brightness(${1 - v * 0.12})`,
              )
            }}
            onCommit={() => commitToRust({ type: 'lomo', intensity: lomoRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.vintage')}
          open={openSection === 'vintage'}
          onToggle={() => toggleSection('vintage')}
        >
          <Slider
            label={t('fil.intensity')}
            value={vintageIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setVintageIntensity(v)
              vintageRef.current = v
              onPreviewFilterChange(
                `sepia(${v * 0.4}) contrast(${1 - v * 0.1}) brightness(${1 + v * 0.05})`,
              )
            }}
            onCommit={() => commitToRust({ type: 'vintage', intensity: vintageRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.coolwarm')}
          open={openSection === 'coolwarm'}
          onToggle={() => toggleSection('coolwarm')}
        >
          <Slider
            label={t('fil.preset.cool')}
            value={coolIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setCoolIntensity(v)
              coolRef.current = v
              onPreviewFilterChange(
                `hue-rotate(${v * 20}deg) saturate(${1 + v * 0.15}) brightness(${1 + v * 0.05})`,
              )
            }}
            onCommit={() => commitToRust({ type: 'cool', intensity: coolRef.current })}
          />
          <Slider
            label={t('fil.preset.warm')}
            value={warmIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setWarmIntensity(v)
              warmRef.current = v
              onPreviewFilterChange(
                `hue-rotate(${-v * 15}deg) saturate(${1 + v * 0.2}) brightness(${1 + v * 0.05})`,
              )
            }}
            onCommit={() => commitToRust({ type: 'warm', intensity: warmRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.fade')}
          open={openSection === 'fade'}
          onToggle={() => toggleSection('fade')}
        >
          <Slider
            label={t('fil.intensity')}
            value={fadeIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setFadeIntensity(v)
              fadeRef.current = v
              onPreviewFilterChange(
                `contrast(${1 - v * 0.3}) brightness(${1 + v * 0.2}) saturate(${1 - v * 0.2})`,
              )
            }}
            onCommit={() => commitToRust({ type: 'fade', intensity: fadeRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.drama')}
          open={openSection === 'drama'}
          onToggle={() => toggleSection('drama')}
        >
          <Slider
            label={t('fil.intensity')}
            value={dramaIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setDramaIntensity(v)
              dramaRef.current = v
              onPreviewFilterChange(
                `contrast(${1 + v * 0.5}) brightness(${1 - v * 0.15}) saturate(${1 - v * 0.3})`,
              )
            }}
            onCommit={() => commitToRust({ type: 'drama', intensity: dramaRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.cross')}
          open={openSection === 'cross'}
          onToggle={() => toggleSection('cross')}
        >
          <Slider
            label={t('fil.intensity')}
            value={crossIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setCrossIntensity(v)
              crossRef.current = v
              onPreviewFilterChange(
                `saturate(${1 + v * 0.5}) hue-rotate(${v * 15}deg) contrast(${1 + v * 0.1})`,
              )
            }}
            onCommit={() => commitToRust({ type: 'cross-process', intensity: crossRef.current })}
          />
        </Section>

        <Section
          title={t('fil.sec.duotone')}
          open={openSection === 'duotone'}
          onToggle={() => toggleSection('duotone')}
        >
          <div className="px-3 pt-1 pb-2 flex flex-col gap-1">
            {DUOTONE_PAIRS.map((pair) => (
              <button
                key={pair.name}
                onClick={() =>
                  commitToRust({
                    type: 'duotone',
                    shadowR: pair.shadow[0],
                    shadowG: pair.shadow[1],
                    shadowB: pair.shadow[2],
                    highlightR: pair.highlight[0],
                    highlightG: pair.highlight[1],
                    highlightB: pair.highlight[2],
                  })
                }
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors text-left"
              >
                <span
                  className="w-4 h-4 rounded-sm shrink-0 border border-slate-600"
                  style={{
                    background: `rgb(${pair.shadow[0]},${pair.shadow[1]},${pair.shadow[2]})`,
                  }}
                />
                <span
                  className="w-4 h-4 rounded-sm shrink-0 border border-slate-600"
                  style={{
                    background: `rgb(${pair.highlight[0]},${pair.highlight[1]},${pair.highlight[2]})`,
                  }}
                />
                {pair.name}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
