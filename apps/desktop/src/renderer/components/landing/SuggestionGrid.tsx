'use client';

import { motion } from 'framer-motion';
import { springs, staggerContainer, staggerItem } from '../../lib/animations';

interface Suggestion {
  title: string;
  description: string;
  prompt: string;
  image: string;
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
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
    >
      {suggestions.map((suggestion, index) => (
        <motion.button
          key={index}
          data-testid={`suggestion-${index}`}
          variants={staggerItem}
          transition={springs.gentle}
          whileHover={{ scale: 1.03, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(suggestion.prompt)}
          className="flex flex-col items-start gap-2 p-3 rounded-xl bg-card border border-border hover:border-foreground/20 hover:shadow-md transition-all duration-200 text-left"
        >
          {/* Image */}
          <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted">
            <img
              src={suggestion.image}
              alt={suggestion.title}
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* Content */}
          <div className="flex flex-col gap-1 w-full">
            <h3 className="font-medium text-sm text-foreground line-clamp-1">
              {suggestion.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {suggestion.description}
            </p>
          </div>
        </motion.button>
      ))}
    </motion.div>
  );
}
