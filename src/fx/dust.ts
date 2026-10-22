type Speck = {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  light: boolean
  size: number
  glint: number
}

/** Big pixels; the canvas is drawn at 1/PIXEL and scaled up crisp. */
const PIXEL = 3
const COUNT = 70

/** Pixel dust motes: brownian jitter on a slowly turning air current, fading in and out. */
export function mountDust(canvas: HTMLCanvasElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  let width = 0
  let height = 0
  let frame = 0
  let last = 0
  let clock = Math.random() * 100
  let specks: Speck[] = []

  const spawn = (age = 0): Speck => {
    const life = 4 + Math.random() * 7
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      age: age * life,
      life,
      light: Math.random() < 0.55,
      size: Math.random() < 0.14 ? 2 : 1,
      glint: 0,
    }
  }

  const resize = () => {
    width = Math.max(1, Math.floor(canvas.clientWidth / PIXEL))
    height = Math.max(1, Math.floor(canvas.clientHeight / PIXEL))
    canvas.width = width
    canvas.height = height
    specks = Array.from({ length: COUNT }, () => spawn(Math.random()))
  }

  const tick = (time: number) => {
    frame = requestAnimationFrame(tick)
    if (document.hidden) return
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0.016
    last = time
    clock += dt
    const windX = Math.sin(clock * 0.13) * 5 + Math.sin(clock * 0.47) * 2.5
    const windY = -3 + Math.sin(clock * 0.19 + 1.3) * 3
    const jitter = 60 * Math.sqrt(dt)
    const drag = Math.exp(-dt * 1.8)
    context.clearRect(0, 0, width, height)
    for (let index = 0; index < specks.length; index += 1) {
      const speck = specks[index]
      speck.age += dt
      speck.vx = speck.vx * drag + (Math.random() - 0.5) * jitter + windX * (1 - drag)
      speck.vy = speck.vy * drag + (Math.random() - 0.5) * jitter + windY * (1 - drag)
      speck.x += speck.vx * dt
      speck.y += speck.vy * dt
      if (speck.glint <= 0 && speck.light && Math.random() < dt * 0.06) speck.glint = 1
      speck.glint = Math.max(0, speck.glint - dt * 2.2)
      const outside = speck.x < -3 || speck.y < -3 || speck.x > width + 3 || speck.y > height + 3
      if (speck.age > speck.life || outside) {
        specks[index] = spawn()
        continue
      }
      const t = speck.age / speck.life
      const fade = Math.min(1, t * 5, (1 - t) * 4)
      const alpha = Math.round(fade * 4) / 4
      if (alpha <= 0) continue
      const size = speck.glint > 0.5 ? 2 : speck.size
      context.fillStyle = speck.light
        ? `rgba(255, 246, 224, ${Math.min(1, 0.6 * alpha + speck.glint * 0.4)})`
        : `rgba(36, 28, 22, ${0.3 * alpha})`
      context.fillRect(Math.round(speck.x), Math.round(speck.y), size, size)
    }
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()
  frame = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}
