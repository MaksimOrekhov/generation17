import { drawPilgrimExterior } from './pilgrimExterior'

const full = document.querySelector<HTMLCanvasElement>('#full')!
const thumb = document.querySelector<HTMLCanvasElement>('#thumb')!
const button = document.querySelector<HTMLButtonElement>('#motion')!
const saveFull = document.querySelector<HTMLAnchorElement>('#save-full')!
const saveThumb = document.querySelector<HTMLAnchorElement>('#save-thumb')!
const fullCtx = full.getContext('2d')!
const thumbCtx = thumb.getContext('2d')!
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
let motion = !reduced.matches
let frame = 0
let elapsed = 0
let lastTimestamp = 0

fullCtx.imageSmoothingEnabled = false
thumbCtx.imageSmoothingEnabled = false

function paint(seconds: number) {
  drawPilgrimExterior(fullCtx, seconds, motion)
  thumbCtx.clearRect(0, 0, thumb.width, thumb.height)
  thumbCtx.drawImage(full, 0, 0, thumb.width, thumb.height)
  saveFull.href = full.toDataURL('image/png')
  saveThumb.href = thumb.toDataURL('image/png')
}

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
}

function animate(timestamp: number) {
  if (lastTimestamp) elapsed += (timestamp - lastTimestamp) / 1000
  lastTimestamp = timestamp
  paint(elapsed)
  frame = requestAnimationFrame(animate)
}

function syncMotionControl() {
  button.disabled = reduced.matches
  button.textContent = motion ? 'Анимация: включена' : 'Анимация: выключена'
  button.setAttribute('aria-pressed', String(motion))
}

function resume() {
  stop()
  lastTimestamp = 0
  if (document.hidden) return
  if (motion) frame = requestAnimationFrame(animate)
  else paint(0)
}

button.addEventListener('click', () => {
  motion = !motion
  syncMotionControl()
  resume()
})

reduced.addEventListener('change', event => {
  if (event.matches) motion = false
  syncMotionControl()
  resume()
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop()
  else resume()
})

syncMotionControl()
paint(0)
resume()
