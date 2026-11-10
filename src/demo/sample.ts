/**
 * A procedural stand-in photo so the editor is usable before you load a file.
 * Deliberately has: smooth sky gradient, a blown-out highlight, deep shadows,
 * skin-tone-ish midtones and fine detail — i.e. something filters can ruin.
 */
export async function makeSampleImage(width = 1600, height = 1067): Promise<ImageBitmap> {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.72)
  sky.addColorStop(0, '#1b2a4a')
  sky.addColorStop(0.45, '#4a6fa5')
  sky.addColorStop(0.75, '#c98d6b')
  sky.addColorStop(1, '#f0c08a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  // sun
  const sunX = width * 0.68
  const sunY = height * 0.5
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, width * 0.32)
  glow.addColorStop(0, 'rgba(255,246,214,1)')
  glow.addColorStop(0.12, 'rgba(255,214,140,0.9)')
  glow.addColorStop(0.45, 'rgba(255,160,90,0.28)')
  glow.addColorStop(1, 'rgba(255,120,60,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // far ridge
  ctx.fillStyle = '#2b3a52'
  ctx.beginPath()
  ctx.moveTo(0, height * 0.62)
  for (let x = 0; x <= width; x += 20) {
    const y = height * 0.62 - Math.sin(x * 0.0032) * height * 0.05 - Math.sin(x * 0.011) * 10
    ctx.lineTo(x, y)
  }
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fill()

  // near ridge
  ctx.fillStyle = '#141c29'
  ctx.beginPath()
  ctx.moveTo(0, height * 0.78)
  for (let x = 0; x <= width; x += 20) {
    const y = height * 0.78 - Math.sin(x * 0.0019 + 2) * height * 0.07 - Math.sin(x * 0.007) * 6
    ctx.lineTo(x, y)
  }
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fill()

  // water with reflected highlight
  const water = ctx.createLinearGradient(0, height * 0.8, 0, height)
  water.addColorStop(0, '#0d1420')
  water.addColorStop(1, '#050810')
  ctx.fillStyle = water
  ctx.fillRect(0, height * 0.8, width, height * 0.2)

  ctx.globalAlpha = 0.5
  for (let i = 0; i < 90; i++) {
    const y = height * 0.8 + Math.random() * height * 0.2
    const w = 30 + Math.random() * 220
    const x = sunX - w / 2 + (Math.random() - 0.5) * 120
    ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},${120 + Math.random() * 60},${0.05 + Math.random() * 0.25})`
    ctx.fillRect(x, y, w, 1 + Math.random() * 2)
  }
  ctx.globalAlpha = 1

  // foreground silhouette detail so sharpening/blur is visible
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.lineWidth = 2
  for (let i = 0; i < 14; i++) {
    const bx = 60 + i * 110
    const by = height * 0.99
    const hh = 90 + Math.random() * 120
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + (Math.random() - 0.5) * 14, by - hh)
    ctx.stroke()
    for (let b = 0; b < 6; b++) {
      const t = b / 6
      ctx.beginPath()
      ctx.moveTo(bx + (Math.random() - 0.5) * 10, by - hh * (0.4 + t * 0.55))
      ctx.lineTo(bx + (Math.random() - 0.5) * 70, by - hh * (0.5 + t * 0.5))
      ctx.stroke()
    }
  }

  // grain
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)

  return createImageBitmap(c)
}
