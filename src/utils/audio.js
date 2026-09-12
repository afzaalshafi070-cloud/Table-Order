let ctx

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

function tone(freq, startTime, duration, gainValue = 0.25) {
  const audioCtx = getCtx()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain).connect(audioCtx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

/** Classic two-note "ding dong" doorbell chime for new-order arrivals. */
export function playDingDong() {
  try {
    const audioCtx = getCtx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const now = audioCtx.currentTime
    tone(880, now, 0.5)        // ding (A5)
    tone(659.25, now + 0.45, 0.6) // dong (E5)
  } catch (e) {
    console.warn('Chime failed to play:', e)
  }
}
