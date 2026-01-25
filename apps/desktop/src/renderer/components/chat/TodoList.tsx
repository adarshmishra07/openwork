/**
 * TodoList - Renders inline todo checklist from TodoWrite tool calls
 * 
 * Displays agent task progress with:
 * - Status icons (empty circle, checkmark, x)
 * - Strikethrough + reduced opacity for completed/cancelled items
 * - Items displayed in order
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Square, CheckSquare, XSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoItem } from '@shopos/shared';
import { springs } from '../../lib/animations';

interface TodoListProps {
  todos: TodoItem[];
}

export const TodoList = memo(function TodoList({ todos }: TodoListProps) {
  return (
    <div className="py-2 space-y-1.5">
      {todos.map((todo, index) => (
        <motion.div
          key={todo.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...springs.gentle, delay: index * 0.03 }}
          className={cn(
            'flex items-start gap-2.5',
            (todo.status === 'completed' || todo.status === 'cancelled') && 'opacity-50'
          )}
        >
          {/* Status icon - square checkboxes in black/white/gray */}
          {todo.status === 'pending' && (
            <Square className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          )}
          {todo.status === 'in_progress' && (
            <div className="h-4 w-4 mt-0.5 shrink-0 relative flex items-center justify-center">
              <Square className="h-4 w-4 text-foreground absolute" />
              <div className="h-2 w-2 bg-muted-foreground rounded-[1px]" />
            </div>
          )}
          {todo.status === 'completed' && (
            <CheckSquare className="h-4 w-4 mt-0.5 text-foreground shrink-0" />
          )}
          {todo.status === 'cancelled' && (
            <XSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          )}
          
          {/* Todo content */}
          <span
            className={cn(
              'text-sm leading-relaxed',
              (todo.status === 'completed' || todo.status === 'cancelled') && 'line-through'
            )}
          >
            {todo.content}
          </span>
        </motion.div>
      ))}
    </div>
  );
});
