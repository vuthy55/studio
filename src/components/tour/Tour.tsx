
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
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        
        const timer = setTimeout(() => {
            updateTargetRect();
        }, 300);

        const scrollAndResizeHandler = () => updateTargetRect();

        window.addEventListener('scroll', scrollAndResizeHandler, true);
        window.addEventListener('resize', scrollAndResizeHandler);

        return () => {
          clearTimeout(timer);
          window.removeEventListener('scroll', scrollAndResizeHandler, true);
          window.removeEventListener('resize', scrollAndResizeHandler);
        };
      }
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, updateTargetRect]);

  const getPopoverPosition = () => {
    if (!popoverRef.current || !targetRect) return {};

    const popoverHeight = popoverRef.current.offsetHeight;
    const popoverWidth = popoverRef.current.offsetWidth;
    const spacing = 10;

    let top = 0;
    let left = 0;

    switch (currentStep?.position) {
        case 'top':
            top = targetRect.top - popoverHeight - spacing;
            left = targetRect.left + (targetRect.width - popoverWidth) / 2;
            break;
        case 'left':
            top = targetRect.top + (targetRect.height - popoverHeight) / 2;
            left = targetRect.left - popoverWidth - spacing;
            break;
        case 'right':
            top = targetRect.top + (targetRect.height - popoverHeight) / 2;
            left = targetRect.right + spacing;
            break;
        case 'bottom':
        default:
            top = targetRect.bottom + spacing;
            left = targetRect.left + (targetRect.width - popoverWidth) / 2;
            break;
    }
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left + popoverWidth > viewportWidth) {
        left = viewportWidth - popoverWidth - spacing;
    }
    if (left < 0) {
        left = spacing;
    }
    
    if (top + popoverHeight > viewportHeight) {
        top = viewportHeight - popoverHeight - spacing;
    }
    if (top < 0) {
        top = spacing;
    }


    return { top, left };
};


  if (!isOpen || !targetRect || !currentStep) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* This is the new, robust overlay system */}
          <div className="pointer-events-none fixed inset-0 z-[10000]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute left-0 top-0 h-full w-full bg-black/70"
              style={{ clipPath: `polygon(0% 0%, 0% 100%, ${targetRect.left}px 100%, ${targetRect.left}px ${targetRect.top}px, ${targetRect.right}px ${targetRect.top}px, ${targetRect.right}px ${targetRect.bottom}px, ${targetRect.left}px ${targetRect.bottom}px, ${targetRect.left}px 100%, 100% 100%, 100% 0%)`}}
            />
          </div>

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
