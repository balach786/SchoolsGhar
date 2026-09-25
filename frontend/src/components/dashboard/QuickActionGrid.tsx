import { useNavigate } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

export interface QuickActionItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  permission?: boolean;
  badge?: string;
  color?: 'navy' | 'amber' | 'gold' | 'cobalt' | 'emerald';
  colorScheme?: 'navy' | 'gold' | 'cobalt' | 'emerald';
}

interface QuickActionGridProps {
  actions: QuickActionItem[];
  className?: string;
  onReorder?: (newOrder: string[]) => void;
}

export function QuickActionGrid({ actions, className, onReorder }: QuickActionGridProps) {
  const navigate = useNavigate();
  const [orderedActions, setOrderedActions] = useState<QuickActionItem[]>([]);
  
  // Drag and Drop State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  
  // Initialize and sync ordered actions
  useEffect(() => {
    setOrderedActions(actions.filter((a) => a.permission !== false));
  }, [actions]);

  if (orderedActions.length === 0) return null;

  // Color mappings matching landing page aesthetic (full card fill + vibrant icon box)
  const getColorStyles = (colorName: string, index: number) => {
    // If no color specified, cycle through these beautiful defaults
    const defaultCycle = ['blue', 'amber', 'indigo', 'emerald', 'purple', 'teal', 'rose'];
    const resolvedColor = colorName || defaultCycle[index % defaultCycle.length];

    switch (resolvedColor) {
      case 'amber':
        return {
          card: 'bg-gradient-to-br from-[#FFFDF5] to-[#FEF3C7] border-[#FDE68A] hover:border-amber-400 hover:shadow-[0_22px_45px_-12px_rgba(245,158,11,0.25)]',
          icon: 'bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white shadow-[0_10px_22px_-5px_rgba(245,158,11,0.5)] border-none',
          text: 'group-hover:text-amber-700 text-amber-950',
          badge: 'bg-amber-100 text-amber-700',
        };
      case 'indigo':
        return {
          card: 'bg-gradient-to-br from-[#F5F3FF] to-[#E0E7FF] border-[#C7D2FE] hover:border-indigo-400 hover:shadow-[0_22px_45px_-12px_rgba(79,70,229,0.25)]',
          icon: 'bg-gradient-to-br from-[#6366F1] to-[#4338CA] text-white shadow-[0_10px_22px_-5px_rgba(79,70,229,0.5)] border-none',
          text: 'group-hover:text-indigo-700 text-indigo-950',
          badge: 'bg-indigo-100 text-indigo-700',
        };
      case 'emerald':
        return {
          card: 'bg-gradient-to-br from-[#F0FDF4] to-[#D1FAE5] border-[#A7F3D0] hover:border-emerald-400 hover:shadow-[0_22px_45px_-12px_rgba(16,185,129,0.25)]',
          icon: 'bg-gradient-to-br from-[#10B981] to-[#047857] text-white shadow-[0_10px_22px_-5px_rgba(16,185,129,0.5)] border-none',
          text: 'group-hover:text-emerald-700 text-emerald-950',
          badge: 'bg-emerald-100 text-emerald-700',
        };
      case 'purple':
        return {
          card: 'bg-gradient-to-br from-[#F8F5FF] to-[#EDE9FE] border-[#DDD6FE] hover:border-purple-400 hover:shadow-[0_22px_45px_-12px_rgba(124,58,237,0.25)]',
          icon: 'bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white shadow-[0_10px_22px_-5px_rgba(124,58,237,0.5)] border-none',
          text: 'group-hover:text-purple-700 text-purple-950',
          badge: 'bg-purple-100 text-purple-700',
        };
      case 'teal':
        return {
          card: 'bg-gradient-to-br from-[#F0FDFA] to-[#CCFBF1] border-[#99F6E4] hover:border-teal-400 hover:shadow-[0_22px_45px_-12px_rgba(20,184,166,0.25)]',
          icon: 'bg-gradient-to-br from-[#14B8A6] to-[#0F766E] text-white shadow-[0_10px_22px_-5px_rgba(20,184,166,0.5)] border-none',
          text: 'group-hover:text-teal-700 text-teal-950',
          badge: 'bg-teal-100 text-teal-700',
        };
      case 'rose':
        return {
          card: 'bg-gradient-to-br from-[#FFF1F2] to-[#FFE4E6] border-[#FECDD3] hover:border-rose-400 hover:shadow-[0_22px_45px_-12px_rgba(244,63,94,0.25)]',
          icon: 'bg-gradient-to-br from-[#F43F5E] to-[#BE123C] text-white shadow-[0_10px_22px_-5px_rgba(244,63,94,0.5)] border-none',
          text: 'group-hover:text-rose-700 text-rose-950',
          badge: 'bg-rose-100 text-rose-700',
        };
      case 'blue':
      case 'navy':
      default:
        return {
          card: 'bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] border-[#BFDBFE] hover:border-blue-400 hover:shadow-[0_22px_45px_-12px_rgba(37,99,235,0.25)]',
          icon: 'bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white shadow-[0_10px_22px_-5px_rgba(37,99,235,0.5)] border-none',
          text: 'group-hover:text-blue-700 text-blue-950',
          badge: 'bg-blue-100 text-blue-700',
        };
    }
  };

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
        className
      )}
    >
      <AnimatePresence>
        {orderedActions.map((action, index) => {
          const Icon = action.icon;
          const handleClick = () => {
            if (action.onClick) action.onClick();
            else if (action.to) navigate(action.to);
          };

          const chosenColor = action.color || action.colorScheme;
          const colorStyles = getColorStyles(chosenColor as string, index);
          
          const isDragging = draggedId === action.id;
          const isDragOver = dragOverId === action.id && draggedId !== action.id;

          return (
            <motion.div
              key={action.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: isDragging ? 0.4 : 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 26,
              }}
              className="h-full w-full"
              draggable
              onDragStart={(e: any) => {
                setDraggedId(action.id);
                e.dataTransfer.effectAllowed = 'move';
                // Required for Firefox:
                e.dataTransfer.setData('text/plain', action.id);
              }}
              onDragOver={(e: any) => {
                e.preventDefault(); // Necessary to allow dropping
                if (draggedId && draggedId !== action.id) {
                  setDragOverId(action.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverId === action.id) setDragOverId(null);
              }}
              onDrop={(e: any) => {
                e.preventDefault();
                if (!draggedId || draggedId === action.id) {
                  setDraggedId(null);
                  setDragOverId(null);
                  return;
                }
                
                const draggedIndex = orderedActions.findIndex(a => a.id === draggedId);
                const dropIndex = orderedActions.findIndex(a => a.id === action.id);
                
                if (draggedIndex !== -1 && dropIndex !== -1) {
                  const newOrder = [...orderedActions];
                  const [removed] = newOrder.splice(draggedIndex, 1);
                  newOrder.splice(dropIndex, 0, removed);
                  
                  setOrderedActions(newOrder);
                  if (onReorder) {
                    onReorder(newOrder.map(a => a.id));
                  }
                }
                
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
            >
              <motion.button
                onClick={handleClick}
                whileHover={{ y: -3, scale: 1.015 }}
                whileTap={{ scale: 0.96 }}
                className={cn(
                  'group relative flex h-full w-full flex-col items-center justify-center p-4',
                  'rounded-2xl border shadow-sm backdrop-blur-sm transition-all hover:shadow-lg',
                  colorStyles.card,
                  isDragOver && 'ring-2 ring-primary border-primary bg-primary/5',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                )}
              >
            {action.badge && (
              <span className={cn('absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold', colorStyles.badge)}>
                {action.badge}
              </span>
            )}
            <div
              className={cn(
                'mb-2 flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110',
                colorStyles.icon
              )}
            >
              <Icon className="h-5 w-5 stroke-[2.2]" />
            </div>
            <span className={cn('w-full text-center text-xs font-bold transition-colors truncate', colorStyles.text)}>
              {action.label}
            </span>
              {action.subtitle && (
                <span className="w-full text-center text-[10px] text-slate-500 mt-0.5 truncate group-hover:text-slate-600 transition-colors">
                  {action.subtitle}
                </span>
              )}
              </motion.button>
            </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}

