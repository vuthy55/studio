
"use client";

import { useTour } from '@/context/TourContext';
import { useState, useLayoutEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const Tour = () => {
  const { isOpen, stopTour, currentStep, goToNextStep, goToPrevStep, stepIndex, steps } = useTour();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);


  const updateTargetRect = useCallback(() => {
    if (isOpen && currentStep) {
      const element = document.querySelector(currentStep.selector) as HTMLElement;
      if (element) {
        // A small delay to wait for layout shifts to complete after scrolling
        setTimeout(() => {
            const rect = element.getBoundingClientRect();
            setTargetRect(rect);
        }, 50);

      } else {
        setTargetRect(null);
      }
    }
  }, [isOpen, currentStep]);

  useLayoutEffect(() => {
    if (!isOpen || !currentStep) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(currentStep.selector) as HTMLElement;
    if (!element) {
      setTargetRect(null);
      return;
    }
    
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    
    // A small delay to allow for the scroll to finish before measuring
    const scrollTimeout = setTimeout(() => {
        updateTargetRect();
    }, 300);


    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    const observer = new MutationObserver(updateTargetRect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });


    return () => {
        clearTimeout(scrollTimeout);
        window.removeEventListener('resize', updateTargetRect);
        window.removeEventListener('scroll', updateTargetRect, true);
        observer.disconnect();
    };
  }, [isOpen, currentStep, updateTargetRect]);


  const getPopoverPosition = () => {
    if (!popoverRef.current || !targetRect) return {};

    const popoverHeight = popoverRef.current.offsetHeight;
    const popoverWidth = popoverRef.current.offsetWidth;
    const spacing = 15; // Increased spacing for the arrow

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

    // Keep popover within viewport bounds
    if (left + popoverWidth > viewportWidth - spacing) {
        left = viewportWidth - popoverWidth - spacing;
    }
    if (left < spacing) {
        left = spacing;
    }
    
    if (top + popoverHeight > viewportHeight - spacing) {
        top = viewportHeight - popoverHeight - spacing;
    }
    if (top < spacing) {
        top = spacing;
    }

    return { top, left };
  };

  const arrowClasses = cn(
    "absolute w-0 h-0 border-solid",
    {
        // Popover is below the element, arrow points up
        'border-x-8 border-x-transparent border-b-8 border-b-accent -top-2 left-1/2 -translate-x-1/2': currentStep?.position === 'bottom' || !currentStep?.position,
        // Popover is above the element, arrow points down
        'border-x-8 border-x-transparent border-t-8 border-t-accent -bottom-2 left-1/2 -translate-x-1/2': currentStep?.position === 'top',
        // Popover is to the left of the element, arrow points right
        'border-y-8 border-y-transparent border-l-8 border-l-accent -right-2 top-1/2 -translate-y-1/2': currentStep?.position === 'left',
        // Popover is to the right of the element, arrow points left
        'border-y-8 border-y-transparent border-r-8 border-r-accent -left-2 top-1/2 -translate-y-1/2': currentStep?.position === 'right'
    }
  );


  if (!isOpen || !currentStep) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && targetRect && (
        <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={getPopoverPosition()}
            className="fixed z-[10002] w-72 rounded-lg bg-card text-card-foreground shadow-xl p-4 border"
        >
            <div className={arrowClasses} />
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
      )}
    </AnimatePresence>
  );
};

export default Tour;
