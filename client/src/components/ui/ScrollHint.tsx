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
        <div className="w-1.5 h-1.5 bg-white/40 rounded-full mt-2" />
      </div>
      <span className="text-[10px] text-white/40 font-medium tracking-widest uppercase">
        Scroll
      </span>
    </motion.div>
  );
});

ScrollHint.displayName = 'ScrollHint';
