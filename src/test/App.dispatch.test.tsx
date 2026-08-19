import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import App from '../App'
import { useImageEditor } from '../hooks/useImageEditor'
import type { FilterCommand } from '../components/FiltersPanel'
import type { AdjustmentCommand } from '../components/AdjustmentsPanel'
import type { ImageMeta } from '../types'

// L'App route chaque commande de panneau vers l'action correspondante de l'éditeur.
// Les panneaux réels ont leurs propres suites : on les remplace ici par des doubles qui
// exposent leur `onApply`, ce qui permet de couvrir la table de routage sans rejouer
// toute leur interface.
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('../hooks/useImageEditor')
vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return { ...actual, setMenuLanguage: vi.fn().mockResolvedValue(undefined) }
})

let applyFilter: ((cmd: FilterCommand) => Promise<void>) | null = null
let applyAdjustment: ((cmd: AdjustmentCommand) => Promise<void>) | null = null

vi.mock('../components/FiltersPanel', () => ({
  FiltersPanel: (props: { onApply: (cmd: FilterCommand) => Promise<void> }) => {
    applyFilter = props.onApply
    return <div data-testid="filters-panel" />
  },
}))
vi.mock('../components/AdjustmentsPanel', () => ({
  AdjustmentsPanel: (props: { onApply: (cmd: AdjustmentCommand) => Promise<void> }) => {
    applyAdjustment = props.onApply
    return <div data-testid="adjustments-panel" />
  },
}))

const mockListen = vi.mocked(listen)
const mockUseImageEditor = vi.mocked(useImageEditor)

type Editor = ReturnType<typeof useImageEditor>

const FILTER_ACTIONS = [
  'handleFilterGrayscale',
  'handleFilterSepia',
  'handleFilterInvert',
  'handleFilterVignette',
  'handleFilterGrain',
  'handleFilterPixelate',
  'handleFilterPosterize',
  'handleFilterDuotone',
  'handleFilterSketch',
  'handleFilterLomo',
  'handleFilterVintage',
  'handleFilterCool',
  'handleFilterWarm',
  'handleFilterFade',
  'handleFilterDrama',
  'handleFilterCrossProcess',
  'handleFilterBlurGaussian',
  'handleFilterBlurMotion',
  'handleFilterBlurRadial',
] as const

const ADJUST_ACTIONS = [
  'handleAdjustBrightnessContrast',
  'handleAdjustExposure',
  'handleAdjustHueSaturation',
  'handleAdjustVibrance',
  'handleAdjustLevels',
  'handleAdjustCurves',
  'handleAdjustWhiteBalance',
  'handleAdjustSharpen',
  'handleAdjustDenoise',
] as const

const OTHER_ACTIONS = [
  'handleStripExif',
  'handleOpenByPaths',
  'handleCopyToClipboard',
  'enterEyedropperMode',
  'exitEyedropperMode',
  'enterInpaintingMode',
  'exitInpaintingMode',
  'handleInpaint',
  'handleOpen',
  'handleCropApply',
  'handleFlip',
  'handleResize',
  'handleCanvasResize',
  'handleRotate',
  'handleExport',
  'handleUndo',
  'handleRedo',
  'handleCloseTab',
  'handleCloseOtherTabs',
  'handleCloseAllTabs',
  'setActiveTab',
  'enterCropMode',
  'exitCropMode',
  'enterRotateMode',
  'exitRotateMode',
  'setZoom',
  'clearError',
  'handleResetToOriginal',
] as const

const meta = (): ImageMeta =>
  ({
    width: 800,
    height: 600,
    format: 'png',
    preview: 'data:image/png;base64,AAA',
    canUndo: true,
    canRedo: false,
    filename: 'photo.png',
    path: '/tmp/photo.png',
  }) as ImageMeta

function editorStub(): Editor {
  const base: Record<string, unknown> = {
    tabs: [
      {
        id: 't1',
        label: 'photo.png',
        image: meta(),
        history: [{ label: 'Open' }],
        historyIndex: 0,
        zoom: 1,
      },
    ],
    activeTabId: 't1',
    image: meta(),
    mode: 'idle',
    isLoading: false,
    error: null,
    zoom: 1,
    history: [{ label: 'Open' }],
    historyIndex: 0,
    canUndo: true,
    canRedo: false,
    loadExif: vi.fn().mockResolvedValue([]),
  }
  for (const name of [...FILTER_ACTIONS, ...ADJUST_ACTIONS, ...OTHER_ACTIONS]) {
    base[name] = vi.fn().mockResolvedValue(undefined)
  }
  return base as unknown as Editor
}

/** Rend l'App puis ouvre le panneau demandé, et renvoie l'éditeur espionné. */
async function openPanel(label: 'Filters' | 'Adjustments') {
  const editor = editorStub()
  mockUseImageEditor.mockReturnValue(editor)
  render(<App />)
  await act(async () => {})
  await userEvent.click(screen.getByLabelText(label))
  return editor as unknown as Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  applyFilter = null
  applyAdjustment = null
  mockListen.mockImplementation((() => Promise.resolve(() => {})) as typeof listen)
})

describe('App — routage des filtres', () => {
  /** Ouvre le panneau, envoie `cmd`, et renvoie l'éditeur pour vérification. */
  async function send(cmd: FilterCommand) {
    const editor = await openPanel('Filters')
    await act(async () => {
      await applyFilter!(cmd)
    })
    return editor
  }

  it('route la conversion en niveaux de gris avec ses pondérations', async () => {
    const editor = await send({ type: 'grayscale', rWeight: 0.3, gWeight: 0.6, bWeight: 0.1 })

    expect(editor.handleFilterGrayscale).toHaveBeenCalledWith(0.3, 0.6, 0.1)
  })

  it('route le sépia avec son intensité', async () => {
    const editor = await send({ type: 'sepia', intensity: 0.7 })

    expect(editor.handleFilterSepia).toHaveBeenCalledWith(0.7)
  })

  it('route l’inversion, qui n’a pas de réglage', async () => {
    const editor = await send({ type: 'invert' })

    expect(editor.handleFilterInvert).toHaveBeenCalled()
  })

  it('route le vignettage avec sa force et son adoucissement', async () => {
    const editor = await send({ type: 'vignette', strength: 0.8, feather: 0.4 })

    expect(editor.handleFilterVignette).toHaveBeenCalledWith(0.8, 0.4)
  })

  it('route le grain avec son mode monochrome', async () => {
    const editor = await send({ type: 'grain', amount: 0.5, monochrome: true })

    expect(editor.handleFilterGrain).toHaveBeenCalledWith(0.5, true)
  })

  it('route la pixelisation avec sa taille de bloc', async () => {
    const editor = await send({ type: 'pixelate', size: 12 })

    expect(editor.handleFilterPixelate).toHaveBeenCalledWith(12)
  })

  it('route la postérisation avec son nombre de niveaux', async () => {
    const editor = await send({ type: 'posterize', levels: 5 })

    expect(editor.handleFilterPosterize).toHaveBeenCalledWith(5)
  })

  it('route le duoton avec ses six composantes, dans l’ordre', async () => {
    const editor = await send({
      type: 'duotone',
      shadowR: 1,
      shadowG: 2,
      shadowB: 3,
      highlightR: 250,
      highlightG: 251,
      highlightB: 252,
    })

    expect(editor.handleFilterDuotone).toHaveBeenCalledWith(1, 2, 3, 250, 251, 252)
  })

  it('route l’esquisse, qui n’a pas de réglage', async () => {
    const editor = await send({ type: 'sketch' })

    expect(editor.handleFilterSketch).toHaveBeenCalled()
  })

  it('route chaque rendu photographique avec son intensité', async () => {
    const cases = [
      ['lomo', 'handleFilterLomo'],
      ['vintage', 'handleFilterVintage'],
      ['cool', 'handleFilterCool'],
      ['warm', 'handleFilterWarm'],
      ['fade', 'handleFilterFade'],
      ['drama', 'handleFilterDrama'],
      ['cross-process', 'handleFilterCrossProcess'],
    ] as const
    // Un seul rendu : chaque `send` en monterait un de plus dans le même test.
    const editor = await openPanel('Filters')

    for (const [type] of cases) {
      await act(async () => {
        await applyFilter!({ type, intensity: 0.6 } as FilterCommand)
      })
    }

    for (const [type, action] of cases) {
      expect(editor[action], type).toHaveBeenCalledWith(0.6)
    }
  })

  it('route le flou gaussien avec son rayon', async () => {
    const editor = await send({ type: 'blur-gaussian', radius: 3.5 })

    expect(editor.handleFilterBlurGaussian).toHaveBeenCalledWith(3.5)
  })

  it('route le flou directionnel avec son angle et sa distance', async () => {
    const editor = await send({ type: 'blur-motion', angle: 45, distance: 20 })

    expect(editor.handleFilterBlurMotion).toHaveBeenCalledWith(45, 20)
  })

  it('route le flou radial avec sa force et son échantillonnage', async () => {
    const editor = await send({ type: 'blur-radial', strength: 0.7, samples: 16 })

    expect(editor.handleFilterBlurRadial).toHaveBeenCalledWith(0.7, 16)
  })

  it('n’appelle qu’une seule action par commande', async () => {
    const editor = await send({ type: 'invert' })

    const called = FILTER_ACTIONS.filter((name) => editor[name].mock.calls.length > 0)
    expect(called).toEqual(['handleFilterInvert'])
  })
})

describe('App — routage des réglages', () => {
  async function send(cmd: AdjustmentCommand) {
    const editor = await openPanel('Adjustments')
    await act(async () => {
      await applyAdjustment!(cmd)
    })
    return editor
  }

  it('route la luminosité et le contraste', async () => {
    const editor = await send({ type: 'brightness-contrast', brightness: 20, contrast: -10 })

    expect(editor.handleAdjustBrightnessContrast).toHaveBeenCalledWith(20, -10)
  })

  it('route l’exposition', async () => {
    const editor = await send({ type: 'exposure', exposure: 1.5 })

    expect(editor.handleAdjustExposure).toHaveBeenCalledWith(1.5)
  })

  it('route la teinte, la saturation et la luminance', async () => {
    const editor = await send({ type: 'hue-saturation', hue: 30, saturation: -20, lightness: 5 })

    expect(editor.handleAdjustHueSaturation).toHaveBeenCalledWith(30, -20, 5)
  })

  it('route la vibrance', async () => {
    const editor = await send({ type: 'vibrance', vibrance: 40 })

    expect(editor.handleAdjustVibrance).toHaveBeenCalledWith(40)
  })

  it('route les niveaux, dans l’ordre entrée/gamma/sortie', async () => {
    const editor = await send({
      type: 'levels',
      inBlack: 10,
      inWhite: 240,
      gamma: 1.2,
      outBlack: 5,
      outWhite: 250,
    })

    expect(editor.handleAdjustLevels).toHaveBeenCalledWith(10, 240, 1.2, 5, 250)
  })

  it('route la courbe avec ses points de contrôle', async () => {
    const points: [number, number][] = [
      [0, 0],
      [0.5, 0.7],
      [1, 1],
    ]

    const editor = await send({ type: 'curves', points })

    expect(editor.handleAdjustCurves).toHaveBeenCalledWith(points)
  })

  it('route la balance des blancs', async () => {
    const editor = await send({ type: 'white-balance', temperature: 25, tint: -15 })

    expect(editor.handleAdjustWhiteBalance).toHaveBeenCalledWith(25, -15)
  })

  it('route l’accentuation avec son seuil', async () => {
    const editor = await send({ type: 'sharpen', amount: 120, radius: 1.5, threshold: 8 })

    expect(editor.handleAdjustSharpen).toHaveBeenCalledWith(120, 1.5, 8)
  })

  it('route le débruitage', async () => {
    const editor = await send({ type: 'denoise', strength: 60 })

    expect(editor.handleAdjustDenoise).toHaveBeenCalledWith(60)
  })

  it('n’appelle qu’une seule action par commande', async () => {
    const editor = await send({ type: 'exposure', exposure: 1 })

    const called = ADJUST_ACTIONS.filter((name) => editor[name].mock.calls.length > 0)
    expect(called).toEqual(['handleAdjustExposure'])
  })
})
