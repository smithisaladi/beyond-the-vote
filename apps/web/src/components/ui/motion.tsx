import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** Fade + 6px rise on mount. Wrap each route page's top-level content. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Staggered entrance container for card grids/lists. First mount only. */
export function StaggerGrid({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : 'hidden'}
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.03 } } }}
    >
      {children}
    </motion.div>
  )
}

/** Child of StaggerGrid. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } }}
    >
      {children}
    </motion.div>
  )
}

/** Spring tap for toggle buttons (follow/track). Spread onto a motion.button. */
export const TAP_SPRING = { whileTap: { scale: 0.96 }, transition: { type: 'spring', stiffness: 500, damping: 30 } } as const
