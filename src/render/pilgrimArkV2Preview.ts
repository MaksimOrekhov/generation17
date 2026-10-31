import { drawPilgrimArkV2 } from './pilgrimArkV2'
import { createPilgrimPreviewMotion } from './pilgrimArkV2Motion'

const full = document.querySelector<HTMLCanvasElement>('#ship-full')!
const small = document.querySelector<HTMLCanvasElement>('#ship-small')!
const toggle = document.querySelector<HTMLButtonElement>('#motion-toggle')!
const downloadFull = document.querySelector<HTMLAnchorElement>('#download-full')!
const downloadSmall = document.querySelector<HTMLAnchorElement>('#download-small')!
const fullCtx = full.getContext('2d')!
const smallCtx = small.getContext('2d')!
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')

fullCtx.imageSmoothingEnabled = false
smallCtx.imageSmoothingEnabled = false

const previewMotion = createPilgrimPreviewMotion({
  draw(seconds, animated) {
    drawPilgrimArkV2(fullCtx, seconds, animated)
    smallCtx.clearRect(0, 0, small.width, small.height)
    smallCtx.drawImage(full, 0, 0, small.width, small.height)
    downloadFull.href = full.toDataURL('image/png')
    downloadSmall.href = small.toDataURL('image/png')
  }
}, {
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id)
}, reduce.matches)

function updateToggle() {
  toggle.textContent = reduce.matches ? 'Анимация: отключена (настройка системы)' : `Анимация: ${previewMotion.enabled ? 'включена' : 'выключена'}`
  toggle.setAttribute('aria-pressed', String(previewMotion.enabled))
  toggle.disabled = reduce.matches
}

toggle.addEventListener('click', () => {
  previewMotion.setEnabled(!previewMotion.enabled)
  updateToggle()
})
reduce.addEventListener('change', event => {
  previewMotion.setReducedMotion(event.matches)
  updateToggle()
})
document.addEventListener('visibilitychange', () => previewMotion.setHidden(document.hidden))
window.addEventListener('pagehide', previewMotion.dispose, { once: true })
updateToggle()
