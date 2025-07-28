
"use client";

import { useTour } from '@/context/TourContext';
import { useState, useLayoutEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const Tour = () => {
  const { isOpen, stopTour, currentStep, goToNextStep, goToPrevStep, stepIndex, steps } = useTour();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updateTargetRect = useCallback(() => {
    if (isOpen && currentStep) {
      const element = document.querySelector(currentStep.selector) as HTMLElement;
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
      }
    }
  }, [isOpen, currentStep]);

  useLayoutEffect(() => {
    if (isOpen && currentStep) {
      const element = document.querySelector(currentStep.selector) as HTMLElement;
      if (element) {
        updateTargetRect(); // Initial position calculation

        element.style.zIndex = '10001';
        element.style.position = 'relative';

        const scrollAndResizeHandler = () => updateTargetRect();

        window.addEventListener('scroll', scrollAndResizeHandler, true);
        window.addEventListener('resize', scrollAndResizeHandler);

        return () => {
          element.style.zIndex = '';
          element.style.position = '';
          window.removeEventListener('scroll', scrollAndResizeHandler, true);
          window.removeEventListener('resize', scrollAndResizeHandler);
        };
      }
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, updateTargetRect]);

  if (!isOpen || !targetRect || !currentStep) {
    return null;
  }

  const getPopoverPosition = () => {
      const popoverHeight = popoverRef.current?.offsetHeight || 0;
      const popoverWidth = popoverRef.current?.offsetWidth || 0;

      switch(currentStep.position) {
          case 'top':
              return { top: `${targetRect.top - popoverHeight - 10}px`, left: `${targetRect.left}px` };
          case 'left':
              return { top: `${targetRect.top}px`, left: `${targetRect.left - popoverWidth - 10}px` };
          case 'right':
              return { top: `${targetRect.top}px`, left: `${targetRect.right + 10}px` };
          case 'bottom':
          default:
              return { top: `${targetRect.bottom + 10}px`, left: `${targetRect.left}px` };
      }
  };


  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[10000]"
            onClick={stopTour}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ 
                opacity: 1,
                x: targetRect.left - 4,
                y: targetRect.top - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
            }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed rounded-lg border-2 border-primary border-dashed bg-primary/10 pointer-events-none z-[10000]"
          />

          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed z-[10002] w-72 rounded-lg bg-card text-card-foreground shadow-xl p-4"
            style={getPopoverPosition()}
          >
            <button
              onClick={stopTour}
              className="absolute top-2 right-2 p-1 rounded-full text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-sm">{currentStep.content}</div>
            <div className="flex justify-between items-center mt-4">
                <div className="text-xs text-muted-foreground">
                    Step {stepIndex + 1} of {steps.length}
                </div>
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <Button variant="ghost" size="sm" onClick={goToPrevStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Prev
                  </Button>
                )}
                <Button size="sm" onClick={goToNextStep}>
                  {stepIndex === steps.length - 1 ? 'Finish' : 'Next'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default Tour;
