import { motion } from 'framer-motion';
import { memo } from 'react';

interface ScrollHintProps {
  className?: string;
}

export const ScrollHint = memo(({ className = '' }: ScrollHintProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.6 }}
      className={`flex flex-col items-center gap-2 ${className}`}
    >
      <div className="relative w-5 h-8 sm:w-6 sm:h-10 rounded-full border-2 border-white/20 flex justify-center">
        <motion.div
          animate={{
            y: [0, 12, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-1.5 h-1.5 bg-white/40 rounded-full mt-2"
        />
      </div>
      <motion.span 
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-[10px] text-white/30 font-medium tracking-widest uppercase"
      >
        Scroll
      </motion.span>
    </motion.div>
  );
});

ScrollHint.displayName = 'ScrollHint';
