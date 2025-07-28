
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
        // Create a new DOMRect with scroll-adjusted coordinates
        const adjustedRect = new DOMRect(
            rect.x + window.scrollX,
            rect.y + window.scrollY,
            rect.width,
            rect.height
        );
        setTargetRect(adjustedRect);
      }
    }
  }, [isOpen, currentStep]);

  useLayoutEffect(() => {
    if (isOpen && currentStep) {
      const element = document.querySelector(currentStep.selector) as HTMLElement;
      if (element) {
        updateTargetRect(); // Initial position calculation

        // Temporarily modify style of the target element for visibility
        element.style.zIndex = '10001';
        element.style.position = 'relative';

        // Add scroll and resize listeners to keep the popover in place
        window.addEventListener('scroll', updateTargetRect, true);
        window.addEventListener('resize', updateTargetRect);

        return () => {
          // Cleanup style and listeners on step change or tour end
          element.style.zIndex = '';
          element.style.position = '';
          window.removeEventListener('scroll', updateTargetRect, true);
          window.removeEventListener('resize', updateTargetRect);
        };
      }
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, updateTargetRect]);

  if (!isOpen || !targetRect || !currentStep) {
    return null;
  }

  const popoverPosition = {
    top: `${targetRect.bottom + 10}px`,
    left: `${targetRect.left}px`,
  };
  
  if (currentStep.position === 'top') {
    popoverPosition.top = `${targetRect.top - 10 - (popoverRef.current?.offsetHeight || 0)}px`;
  } else if (currentStep.position === 'bottom') {
    popoverPosition.top = `${targetRect.bottom + 10}px`;
  } else if (currentStep.position === 'left') {
    popoverPosition.top = `${targetRect.top}px`;
    popoverPosition.left = `${targetRect.left - 10 - (popoverRef.current?.offsetWidth || 0)}px`;
  } else if (currentStep.position === 'right') {
     popoverPosition.top = `${targetRect.top}px`;
     popoverPosition.left = `${targetRect.right + 10}px`;
  }


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
                x: targetRect.x - 4,
                y: targetRect.y - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
            }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed rounded-lg border-2 border-primary border-dashed bg-primary/10 pointer-events-none z-[10000]"
            style={{ 
                transform: `translate(${targetRect.x - 4}px, ${targetRect.y - 4}px)` 
            }}
          />

          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed z-[10002] w-72 rounded-lg bg-card text-card-foreground shadow-xl p-4"
            style={popoverPosition}
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
