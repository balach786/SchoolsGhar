import type { Variants } from 'framer-motion';

export const motionTiming = { fast: 0.18, normal: 0.34, slow: 0.56, ease: [0.22, 1, 0.36, 1] as const };
export const revealViewport = { once: true, amount: 0.18 };
export type RevealDirection = 'up' | 'left' | 'right' | 'scale';
export function revealVariants(reduced: boolean, direction: RevealDirection = 'up'): Variants {
  return {
    hidden: reduced ? { opacity: 1, x: 0, y: 0, scale: 1 } : {
      opacity: 0, x: direction === 'left' ? 20 : direction === 'right' ? -20 : 0,
      y: direction === 'up' || direction === 'scale' ? 24 : 0,
      scale: direction === 'scale' ? 0.985 : 1,
    },
    visible: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: reduced ? 0 : motionTiming.slow, ease: motionTiming.ease } },
  };
}
export function staggerVariants(reduced: boolean, sidebar = false): Variants {
  return { hidden: {}, visible: { transition: { staggerChildren: reduced ? 0 : sidebar ? 0.03 : 0.06 } } };
}
export function sidebarVariants(reduced: boolean, item = false): Variants {
  return {
    hidden: { opacity: reduced ? 1 : 0, x: reduced ? 0 : item ? -8 : -18 },
    visible: { opacity: 1, x: 0, transition: { duration: reduced ? 0 : motionTiming.normal, ease: motionTiming.ease } },
  };
}

export const appleSpring = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } as const;
export const appleBouncySpring = { type: 'spring', stiffness: 420, damping: 24, mass: 0.7 } as const;
export const appleEase = [0.16, 1, 0.3, 1] as const;

export const appleCardMotion = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: appleSpring },
  whileHover: { y: -4, scale: 1.015, transition: appleBouncySpring },
  whileTap: { scale: 0.97, transition: { duration: 0.1 } },
};

export const appleButtonMotion = {
  whileHover: { scale: 1.02, transition: appleBouncySpring },
  whileTap: { scale: 0.95, transition: { duration: 0.08 } },
};
