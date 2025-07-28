
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
  const [debugValues, setDebugValues] = useState<any>(null);


  const updateTargetRect = useCallback(() => {
    if (isOpen && currentStep) {
      const element = document.querySelector(currentStep.selector) as HTMLElement;
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        
        // Debugging values
        const mainScrollContainer = document.querySelector('main');
        setDebugValues({
          targetTop: rect.top.toFixed(2),
          targetLeft: rect.left.toFixed(2),
          scrollTop: mainScrollContainer ? mainScrollContainer.scrollTop.toFixed(2) : 'N/A',
        });

      } else {
        setTargetRect(null);
        setDebugValues(null);
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
    
    // Using a timeout to wait for layout shifts to complete after scrolling
    const timerId = setTimeout(() => {
        updateTargetRect();
    }, 150);

    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    return () => {
        clearTimeout(timerId);
        window.removeEventListener('resize', updateTargetRect);
        window.removeEventListener('scroll', updateTargetRect, true);
    };
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

  if (!isOpen || !currentStep) {
    return null;
  }
  
  const highlightPadding = 5;

  let finalTargetRect = targetRect;
  if (stepIndex === 0 && finalTargetRect) {
      finalTargetRect = new DOMRect(finalTargetRect.x, 200, finalTargetRect.width, finalTargetRect.height);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
         {debugValues && (
            <div className="fixed bottom-4 left-4 z-[10003] bg-destructive text-destructive-foreground p-2 rounded-md font-mono text-xs shadow-lg">
              <div>Target Top: {debugValues.targetTop}</div>
              <div>Target Left: {debugValues.targetLeft}</div>
              <div>ScrollTop: {debugValues.scrollTop}</div>
            </div>
          )}
          {finalTargetRect && (
            <>
                <motion.div
                    className="fixed inset-0 z-[10000] pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Top overlay */}
                    <div className="absolute left-0 top-0 bg-black/70" style={{ width: '100%', height: `${finalTargetRect.top - highlightPadding}px` }} />
                    {/* Bottom overlay */}
                    <div className="absolute left-0 bg-black/70" style={{ top: `${finalTargetRect.bottom + highlightPadding}px`, width: '100%', height: `calc(100vh - ${finalTargetRect.bottom + highlightPadding}px)` }} />
                    {/* Left overlay */}
                    <div className="absolute left-0 bg-black/70" style={{ top: `${finalTargetRect.top - highlightPadding}px`, width: `${finalTargetRect.left - highlightPadding}px`, height: `${finalTargetRect.height + highlightPadding * 2}px` }} />
                    {/* Right overlay */}
                    <div className="absolute bg-black/70" style={{ top: `${finalTargetRect.top - highlightPadding}px`, left: `${finalTargetRect.right + highlightPadding}px`, width: `calc(100vw - ${finalTargetRect.right + highlightPadding}px)`, height: `${finalTargetRect.height + highlightPadding * 2}px` }} />
                    
                    {/* Highlight border */}
                    <div
                    className="absolute border-2 border-primary border-dashed rounded-md transition-all duration-300"
                    style={{
                        top: `${finalTargetRect.top - highlightPadding}px`,
                        left: `${finalTargetRect.left - highlightPadding}px`,
                        width: `${finalTargetRect.width + highlightPadding * 2}px`,
                        height: `${finalTargetRect.height + highlightPadding * 2}px`,
                    }}
                    />
                </motion.div>

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
        </>
      )}
    </AnimatePresence>
  );
};

export default Tour;
