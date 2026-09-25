import type { PropsWithChildren } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { motionTiming, revealVariants, revealViewport, sidebarVariants, staggerVariants, type RevealDirection } from '@/lib/motion';

type RevealProps = HTMLMotionProps<'div'> & { direction?: RevealDirection };
export function ScrollReveal({ direction = 'up', ...props }: RevealProps) {
  const reduced = !!useReducedMotion();
  return <motion.div variants={revealVariants(reduced, direction)} initial="hidden" whileInView="visible" viewport={revealViewport} {...props} />;
}
export function StaggerContainer({ entrance = false, ...props }: HTMLMotionProps<'div'> & { entrance?: boolean }) {
  const reduced = !!useReducedMotion();
  return <motion.div variants={staggerVariants(reduced)} initial="hidden" {...(entrance ? { animate: 'visible' } : { whileInView: 'visible', viewport: revealViewport })} {...props} />;
}
export function StaggerItem(props: RevealProps) {
  const reduced = !!useReducedMotion();
  return <motion.div variants={revealVariants(reduced, props.direction)} {...props} />;
}
const MotionCard = motion.create(Card);
export function RevealCard(props: React.ComponentProps<typeof MotionCard>) {
  const reduced = !!useReducedMotion();
  return <MotionCard variants={revealVariants(reduced)} initial="hidden" whileInView="visible" viewport={revealViewport} {...props} />;
}
export function PageTransition({ children }: PropsWithChildren) {
  const reduced = !!useReducedMotion();
  return <motion.div initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : motionTiming.normal, ease: motionTiming.ease }}>{children}</motion.div>;
}
export function SidebarEntrance(props: HTMLMotionProps<'aside'>) {
  const reduced = !!useReducedMotion();
  return <motion.aside variants={sidebarVariants(reduced)} initial="hidden" animate="visible" {...props} />;
}
export function SidebarMenu(props: HTMLMotionProps<'nav'>) {
  const reduced = !!useReducedMotion();
  return <motion.nav variants={staggerVariants(reduced, true)} initial="hidden" animate="visible" {...props} />;
}
export function SidebarItem(props: HTMLMotionProps<'div'>) {
  const reduced = !!useReducedMotion();
  return <motion.div variants={sidebarVariants(reduced, true)} {...props} />;
}
export function ActiveSidebarPill({ id }: { id: string }) {
  const reduced = !!useReducedMotion();
  return <motion.span aria-hidden="true" className="sidebar-active-pill" layoutId={reduced ? undefined : id} transition={{ duration: reduced ? 0 : motionTiming.normal, ease: motionTiming.ease }} />;
}
export function FloatingHeader(props: HTMLMotionProps<'header'>) {
  const reduced = !!useReducedMotion();
  return <motion.header initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : -15, scale: reduced ? 1 : 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : motionTiming.slow, ease: motionTiming.ease }} {...props} />;
}

export function AppleMotionCard({ children, className, ...props }: HTMLMotionProps<'div'>) {
  const reduced = !!useReducedMotion();
  return (
    <motion.div
      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.985 }}
      whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      whileHover={reduced ? undefined : { y: -3, scale: 1.012 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.8 }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function AppleSpringButton({ children, className, ...props }: HTMLMotionProps<'button'>) {
  const reduced = !!useReducedMotion();
  return (
    <motion.button
      whileHover={reduced ? undefined : { scale: 1.02 }}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  );
}

