import { invoke } from '@tauri-apps/api/core'
import type { CropRect, ExportFormat, ImageMeta } from '../types'

function mapMeta(raw: Record<string, unknown>): ImageMeta {
  return {
    width: raw.width as number,
    height: raw.height as number,
    format: raw.format as string,
    preview: raw.preview as string,
    canUndo: (raw.can_undo as boolean) ?? false,
    canRedo: (raw.can_redo as boolean) ?? false,
    filename: raw.filename as string | undefined,
    path: raw.path as string | undefined,
  }
}

export interface OpenedImage {
  tabId: string
  meta: ImageMeta
}

export async function openImages(): Promise<OpenedImage[]> {
  const results =
    await invoke<Array<{ tab_id: string; meta: Record<string, unknown> }>>('open_images')
  return results.map((r) => ({ tabId: r.tab_id, meta: mapMeta(r.meta) }))
}

export async function openImagesByPaths(paths: string[]): Promise<OpenedImage[]> {
  const results = await invoke<Array<{ tab_id: string; meta: Record<string, unknown> }>>(
    'open_images_by_paths',
    { paths },
  )
  return results.map((r) => ({ tabId: r.tab_id, meta: mapMeta(r.meta) }))
}

export async function cropImage(tabId: string, rect: CropRect): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('crop_image', {
    tabId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  })
  return mapMeta(raw)
}

export async function resizeImage(
  tabId: string,
  width: number,
  height: number,
): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('resize_image', { tabId, width, height })
  return mapMeta(raw)
}

export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export async function canvasResizeImage(
  tabId: string,
  width: number,
  height: number,
  anchor: Anchor,
  fill: [number, number, number, number],
): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('canvas_resize_image', {
    tabId,
    width,
    height,
    anchor,
    fill,
  })
  return mapMeta(raw)
}

export async function flipImage(
  tabId: string,
  direction: 'horizontal' | 'vertical',
): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('flip_image', { tabId, direction })
  return mapMeta(raw)
}

export async function rotateImage(tabId: string, degrees: number): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('rotate_image', { tabId, degrees })
  return mapMeta(raw)
}

export async function exportImage(
  tabId: string,
  format: ExportFormat,
  quality?: number,
): Promise<void> {
  return invoke<void>('export_image', { tabId, format, quality: quality ?? null })
}

export async function undoImage(tabId: string): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('undo_image', { tabId })
  return mapMeta(raw)
}

export async function redoImage(tabId: string): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('redo_image', { tabId })
  return mapMeta(raw)
}

export async function resetToOriginal(tabId: string): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('reset_to_original', { tabId })
  return mapMeta(raw)
}

export async function setMenuLanguage(lang: string): Promise<void> {
  return invoke<void>('set_menu_language', { lang })
}

export async function closeTab(tabId: string): Promise<void> {
  return invoke<void>('close_tab', { tabId })
}

export async function closeAllTabs(): Promise<void> {
  return invoke<void>('close_all_tabs')
}

export async function closeOtherTabs(tabId: string): Promise<void> {
  return invoke<void>('close_other_tabs', { tabId })
}

export interface ExifField {
  tag: string
  value: string
}

export async function getExif(tabId: string): Promise<ExifField[]> {
  return invoke<ExifField[]>('get_exif', { tabId })
}

export async function stripExif(tabId: string): Promise<boolean> {
  return invoke<boolean>('strip_exif', { tabId })
}

export async function adjustBrightnessContrast(
  tabId: string,
  brightness: number,
  contrast: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('adjust_brightness_contrast', {
      tabId,
      brightness,
      contrast,
    }),
  )
}

export async function adjustExposure(tabId: string, exposure: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('adjust_exposure', { tabId, exposure }))
}

export async function adjustHueSaturation(
  tabId: string,
  hue: number,
  saturation: number,
  lightness: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('adjust_hue_saturation', {
      tabId,
      hue,
      saturation,
      lightness,
    }),
  )
}

export async function adjustVibrance(tabId: string, vibrance: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('adjust_vibrance', { tabId, vibrance }))
}

export async function adjustLevels(
  tabId: string,
  inBlack: number,
  inWhite: number,
  gamma: number,
  outBlack: number,
  outWhite: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('adjust_levels', {
      tabId,
      inBlack,
      inWhite,
      gamma,
      outBlack,
      outWhite,
    }),
  )
}

export async function adjustCurves(tabId: string, points: [number, number][]): Promise<ImageMeta> {
  const mapped = points.map(([x, y]) => [x, y] as [number, number])
  return mapMeta(await invoke<Record<string, unknown>>('adjust_curves', { tabId, points: mapped }))
}

export async function adjustWhiteBalance(
  tabId: string,
  temperature: number,
  tint: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('adjust_white_balance', { tabId, temperature, tint }),
  )
}

export async function adjustSharpen(
  tabId: string,
  amount: number,
  radius: number,
  threshold: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('adjust_sharpen', { tabId, amount, radius, threshold }),
  )
}

export async function adjustDenoise(tabId: string, strength: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('adjust_denoise', { tabId, strength }))
}

export async function filterGrayscale(
  tabId: string,
  rWeight: number,
  gWeight: number,
  bWeight: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('filter_grayscale', { tabId, rWeight, gWeight, bWeight }),
  )
}

export async function filterSepia(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_sepia', { tabId, intensity }))
}

export async function filterInvert(tabId: string): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_invert', { tabId }))
}

export async function filterVignette(
  tabId: string,
  strength: number,
  feather: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('filter_vignette', { tabId, strength, feather }),
  )
}

export async function filterGrain(
  tabId: string,
  amount: number,
  monochrome: boolean,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('filter_grain', { tabId, amount, monochrome }),
  )
}

export async function filterPixelate(tabId: string, size: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_pixelate', { tabId, size }))
}

export async function filterPosterize(tabId: string, levels: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_posterize', { tabId, levels }))
}

export async function filterDuotone(
  tabId: string,
  shadowR: number,
  shadowG: number,
  shadowB: number,
  highlightR: number,
  highlightG: number,
  highlightB: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('filter_duotone', {
      tabId,
      shadowR,
      shadowG,
      shadowB,
      highlightR,
      highlightG,
      highlightB,
    }),
  )
}

export async function filterSketch(tabId: string): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_sketch', { tabId }))
}

export async function filterLomo(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_lomo', { tabId, intensity }))
}

export async function filterVintage(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_vintage', { tabId, intensity }))
}

export async function filterCool(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_cool', { tabId, intensity }))
}

export async function filterWarm(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_warm', { tabId, intensity }))
}

export async function filterFade(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_fade', { tabId, intensity }))
}

export async function filterDrama(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_drama', { tabId, intensity }))
}

export async function filterCrossProcess(tabId: string, intensity: number): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('filter_cross_process', { tabId, intensity }),
  )
}

export async function filterBlurGaussian(tabId: string, radius: number): Promise<ImageMeta> {
  return mapMeta(await invoke<Record<string, unknown>>('filter_blur_gaussian', { tabId, radius }))
}

export async function filterBlurMotion(
  tabId: string,
  angle: number,
  distance: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('filter_blur_motion', { tabId, angle, distance }),
  )
}

export async function filterBlurRadial(
  tabId: string,
  strength: number,
  samples: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('filter_blur_radial', { tabId, strength, samples }),
  )
}

export async function inpaintImage(
  tabId: string,
  maskB64: string,
  maskWidth: number,
  maskHeight: number,
): Promise<ImageMeta> {
  return mapMeta(
    await invoke<Record<string, unknown>>('inpaint_image', {
      tabId,
      maskB64,
      maskWidth,
      maskHeight,
    }),
  )
}
