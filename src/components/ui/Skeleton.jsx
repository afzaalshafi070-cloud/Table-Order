/**
 * Skeleton — shimmer placeholder. Use width/height or className.
 * aria-hidden: screen readers should announce a loading message instead.
 */
export default function Skeleton({ width = '100%', height = 16, radius, className = '', style }) {
  return (
    <span
      aria-hidden="true"
      className={`ui-skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}
