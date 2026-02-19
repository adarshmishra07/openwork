'use client';

import { motion } from 'framer-motion';
import { springs, staggerContainer, staggerItem } from '../../lib/animations';

interface Suggestion {
  title: string;
  prompt: string;
}

interface SuggestionGridProps {
  suggestions: Suggestion[];
  onSelect: (prompt: string) => void;
}

export default function SuggestionGrid({ suggestions, onSelect }: SuggestionGridProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="flex flex-wrap justify-center gap-2"
    >
      {suggestions.map((suggestion, index) => (
        <motion.button
          key={index}
          data-testid={`suggestion-${index}`}
          variants={staggerItem}
          transition={springs.gentle}
          whileHover={{ scale: 1.04, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(suggestion.prompt)}
          className="px-4 py-2 rounded-full border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:shadow-sm transition-all duration-200"
        >
          {suggestion.title}
        </motion.button>
      ))}
    </motion.div>
  );
}
