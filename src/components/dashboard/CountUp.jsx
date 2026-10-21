import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/**
 * CountUp — animates a number from its previous value to `value`.
 * Users with reduced motion get the final value immediately.
 */
export default function CountUp({ value, duration = 0.8, format }) {
  const target = Number(value) || 0
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    if (reduce) {
      fromRef.current = target
      setDisplay(target)
      return
    }
    const controls = animate(fromRef.current, target, {
      duration,
      ease: 'easeOut',
      onUpdate: v => setDisplay(v),
    })
    fromRef.current = target
    return () => controls.stop()
  }, [target, duration, reduce])

  const text = format ? format(display) : Math.round(display).toLocaleString()
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</span>
}
