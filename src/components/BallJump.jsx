import { useEffect, useRef, useState } from 'react'

const GROUND = 0
const JUMP_HEIGHT = 90
const JUMP_DURATION = 550 // ms
const OBSTACLE_SPEED_START = 2400 // ms per crossing, gets faster over time

export default function BallJump() {
  const [jumping, setJumping] = useState(false)
  const [running, setRunning] = useState(false)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const trackRef = useRef(null)
  const ballRef = useRef(null)
  const obstacleRef = useRef(null)
  const rafRef = useRef(null)
  const jumpStartRef = useRef(0)
  const speedRef = useRef(OBSTACLE_SPEED_START)
  const scoreRef = useRef(0)

  const jump = () => {
    if (jumping || !running) return
    setJumping(true)
    jumpStartRef.current = performance.now()
  }

  // Jump arc animation
  useEffect(() => {
    if (!jumping) return
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - jumpStartRef.current) / JUMP_DURATION)
      const height = Math.sin(t * Math.PI) * JUMP_HEIGHT
      if (ballRef.current) ballRef.current.style.transform = `translateY(${-height}px) rotate(${t * 360}deg)`
      if (t < 1) raf = requestAnimationFrame(tick)
      else setJumping(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [jumping])

  // Obstacle loop + collision + scoring
  useEffect(() => {
    if (!running) return
    let obstacleX = 100 // percent, starts off-screen right
    let last = performance.now()
    let cancelled = false

    const loop = (now) => {
      if (cancelled) return
      const dt = now - last
      last = now
      obstacleX -= (dt / speedRef.current) * 100
      if (obstacleX < -10) {
        obstacleX = 100
        scoreRef.current += 1
        setScore(scoreRef.current)
        speedRef.current = Math.max(1100, speedRef.current - 60) // speed up gradually
      }
      if (obstacleRef.current) obstacleRef.current.style.left = `${obstacleX}%`

      // Collision: obstacle near the ball's fixed x-position (~8%) and ball not high enough
      const ballIsUp = ballRef.current
        ? Math.abs(parseFloat(ballRef.current.style.transform.match(/-?\d+/)?.[0] || '0')) > 40
        : false
      if (obstacleX < 14 && obstacleX > 4 && !ballIsUp) {
        cancelled = true
        setRunning(false)
        setGameOver(true)
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current) }
  }, [running])

  const start = () => {
    scoreRef.current = 0
    speedRef.current = OBSTACLE_SPEED_START
    setScore(0)
    setGameOver(false)
    setRunning(true)
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      padding: 18, marginTop: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 17 }}>Ball Jump</strong>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#7a7264' }}>Score: {score}</span>
      </div>

      <div
        ref={trackRef}
        onClick={running ? jump : start}
        onTouchStart={(e) => { e.preventDefault(); running ? jump() : start() }}
        style={{
          position: 'relative', height: 140, background: 'var(--paper-dim)',
          borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
          border: '1px solid var(--line)'
        }}>
        {/* ground line */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 28, height: 2, background: 'var(--line)' }} />

        {/* ball */}
        <div ref={ballRef} style={{
          position: 'absolute', left: '8%', bottom: 30, width: 26, height: 26,
          borderRadius: '50%', background: 'var(--brand-primary)',
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
        }} />

        {/* obstacle */}
        {running && (
          <div ref={obstacleRef} style={{
            position: 'absolute', left: '100%', bottom: 30, width: 18, height: 30,
            borderRadius: 4, background: 'var(--clay)'
          }} />
        )}

        {!running && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4, textAlign: 'center', padding: 12
          }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {gameOver ? `Game over — score ${score}` : 'Tap to start'}
            </div>
            <div style={{ fontSize: 12, color: '#7a7264' }}>Rukawat aane se pehle tap kar ke jump karein</div>
          </div>
        )}
      </div>
    </div>
  )
}
