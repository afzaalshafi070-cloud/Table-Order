let ctx

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

function tone(freq, startTime, duration, gainValue = 0.22, type = 'sine') {
  const audioCtx = getCtx()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.value = freq
  // Soft attack + clean decay — no click/clip
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.018)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain).connect(audioCtx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.04)
}

/**
 * Professional counter notification: short two-note "ting-tong" chime.
 * Clear enough for staff, not an alarm loop.
 * Uses Web Audio (no external file) so it works offline and respects autoplay unlock.
 */
export function playDingDong() {
  try {
    const audioCtx = getCtx()
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    const now = audioCtx.currentTime
    // Bright but soft: G5 → E5 (classic doorbell interval, clean sine)
    tone(784, now, 0.38, 0.24, 'sine')       // ting (G5)
    tone(659.25, now + 0.32, 0.52, 0.2, 'sine') // tong (E5)
  } catch (e) {
    console.warn('Chime failed to play:', e)
  }
}

/** Call once after a user gesture so browsers unlock AudioContext. */
export function unlockAudio() {
  try {
    const audioCtx = getCtx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch {}
}
