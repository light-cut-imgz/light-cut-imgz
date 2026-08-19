import type { EditorMode } from '../types'
import { useT } from '../lib/locale'

interface ToolbarProps {
  hasImage: boolean
  mode: EditorMode
  isLoading: boolean
  showFlipBar?: boolean
  showAdjustments?: boolean
  onAdjustmentsOpen?: () => void
  showFilters?: boolean
  onFiltersOpen?: () => void
  onCropMode: () => void
  onRotateMode: () => void
  onFlipOpen: () => void
  onResizeOpen: () => void
  onCanvasResizeOpen: () => void
  onExportOpen: () => void
  showExif?: boolean
  onToggleExif?: () => void
  showGrid?: boolean
  onToggleGrid?: () => void
  onCopy?: () => void
  onEyedropperMode?: () => void
  onInpaintMode?: () => void
  onPrefsOpen?: () => void
}

interface BtnProps {
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
  title: string
  label: string
  'aria-label'?: string
  'aria-pressed'?: boolean
  children: React.ReactNode
}

function SidebarBtn({
  onClick,
  disabled,
  active,
  primary,
  title,
  label,
  children,
  ...aria
}: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={aria['aria-label'] ?? title}
      aria-pressed={aria['aria-pressed']}
      className={[
        'w-full flex flex-col items-center gap-1 py-2 px-1 rounded transition-colors',
        disabled
          ? 'opacity-30 cursor-not-allowed'
          : primary
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
            : active
              ? 'bg-indigo-600/20 text-indigo-400'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
      ].join(' ')}
    >
      {children}
      <span className="text-[9px] leading-none tracking-wide">{label}</span>
    </button>
  )
}

function Sep() {
  return <div className="w-10 h-px bg-slate-700 my-1" />
}

export function Toolbar({
  hasImage,
  mode,
  isLoading,
  showFlipBar,
  showAdjustments,
  onAdjustmentsOpen,
  showFilters,
  onFiltersOpen,
  onCropMode,
  onRotateMode,
  onFlipOpen,
  onResizeOpen,
  onCanvasResizeOpen,
  showExif,
  onToggleExif,
  showGrid,
  onToggleGrid,
  onCopy,
  onEyedropperMode,
  onInpaintMode,
  onPrefsOpen,
  onExportOpen,
}: ToolbarProps) {
  const t = useT()
  const disabled = !hasImage || isLoading

  return (
    <aside className="w-[72px] bg-slate-900 border-r border-slate-700 flex flex-col items-center py-2 gap-0.5 select-none shrink-0 px-1.5">
      {/* Branding */}
      <span className="text-xs font-bold text-indigo-400 mb-2 mt-1 tracking-tight">Z</span>

      {/* Transform tools */}
      <SidebarBtn
        onClick={onCropMode}
        disabled={disabled}
        active={mode === 'cropping'}
        title={t('tooltip.crop')}
        label={t('toolbar.crop')}
        aria-pressed={mode === 'cropping'}
      >
        <CropIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onRotateMode}
        disabled={disabled}
        active={mode === 'rotating'}
        title={t('tooltip.rotate')}
        label={t('toolbar.rotate')}
        aria-pressed={mode === 'rotating'}
      >
        <RotateIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onFlipOpen}
        disabled={disabled}
        active={showFlipBar}
        title={t('tooltip.flip')}
        label={t('toolbar.flip')}
        aria-label={t('tooltip.flip')}
        aria-pressed={showFlipBar}
      >
        <FlipIcon />
      </SidebarBtn>

      <Sep />

      <SidebarBtn
        onClick={onResizeOpen}
        disabled={disabled}
        title={t('tooltip.resize')}
        label={t('toolbar.resize')}
        aria-label={t('tooltip.resize')}
      >
        <ResizeIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onCanvasResizeOpen}
        disabled={disabled}
        title={t('tooltip.canvas')}
        label={t('toolbar.canvas')}
        aria-label={t('tooltip.canvas')}
      >
        <CanvasResizeIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onEyedropperMode}
        disabled={disabled}
        active={mode === 'eyedropper'}
        title={t('tooltip.picker')}
        label={t('toolbar.picker')}
        aria-label={t('tooltip.picker')}
        aria-pressed={mode === 'eyedropper'}
      >
        <EyedropperIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onInpaintMode}
        disabled={disabled}
        active={mode === 'inpainting'}
        title={t('tooltip.inpaint')}
        label={t('toolbar.inpaint')}
        aria-label={t('tooltip.inpaint')}
        aria-pressed={mode === 'inpainting'}
      >
        <InpaintIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onAdjustmentsOpen}
        disabled={disabled}
        active={showAdjustments}
        title={t('tooltip.adjust')}
        label={t('toolbar.adjust')}
        aria-label={t('tooltip.adjust')}
        aria-pressed={showAdjustments}
      >
        <AdjustmentsIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onFiltersOpen}
        disabled={disabled}
        active={showFilters}
        title={t('tooltip.filters')}
        label={t('toolbar.filters')}
        aria-label={t('tooltip.filters')}
        aria-pressed={showFilters}
      >
        <FiltersIcon />
      </SidebarBtn>

      <Sep />

      <SidebarBtn
        onClick={onCopy}
        disabled={disabled}
        title={t('tooltip.copy')}
        label={t('toolbar.copy')}
        aria-label={t('tooltip.copy')}
      >
        <CopyIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onToggleGrid}
        disabled={!hasImage}
        active={showGrid}
        title={t('tooltip.grid')}
        label={t('toolbar.grid')}
        aria-label={t('tooltip.grid')}
        aria-pressed={showGrid}
      >
        <GridIcon />
      </SidebarBtn>
      <SidebarBtn
        onClick={onToggleExif}
        disabled={!hasImage}
        active={showExif}
        title={t('tooltip.exif')}
        label={t('toolbar.exif')}
        aria-label={t('tooltip.exif')}
        aria-pressed={showExif}
      >
        <InfoIcon />
      </SidebarBtn>

      <div className="flex-1" />

      <Sep />

      <SidebarBtn
        onClick={onPrefsOpen}
        title={t('tooltip.prefs')}
        label={t('toolbar.prefs')}
        aria-label={t('tooltip.prefs')}
      >
        <GearIcon />
      </SidebarBtn>

      <SidebarBtn
        onClick={onExportOpen}
        disabled={disabled}
        primary
        title={t('tooltip.export')}
        label={t('toolbar.export')}
        aria-label={t('tooltip.export')}
      >
        <ExportIcon />
      </SidebarBtn>
    </aside>
  )
}

function CropIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 2 6 6 2 6" />
      <polyline points="18 22 18 18 22 18" />
      <path d="M2 12h14v10" />
      <path d="M12 2v14H2" />
    </svg>
  )
}

function RotateIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

function FlipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M7 16H3v-4" />
      <path d="M3 12l5-5" />
      <path d="M17 8h4v4" />
      <path d="M21 12l-5 5" />
      <path d="M12 3v18" strokeDasharray="3 2" />
    </svg>
  )
}

function ResizeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

function CanvasResizeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="3 2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  )
}

function EyedropperIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 14l-6-6-8.5 8.5a2.12 2.12 0 0 0 3 3L17 11" />
      <path d="M7 17L4.5 19.5a2.12 2.12 0 0 1-3-3L4 14" />
      <circle cx="19" cy="5" r="2" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function AdjustmentsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FiltersIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
      <path
        d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

function InpaintIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 14l-6-6-8 8a2.83 2.83 0 0 0 4 4l8-8" />
      <path d="M6.5 17.5L3 21" strokeLinecap="round" />
      <circle cx="18" cy="4" r="2" fill="currentColor" stroke="none" />
      <path d="M3 12h1M7 4v1M12 3h1" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
