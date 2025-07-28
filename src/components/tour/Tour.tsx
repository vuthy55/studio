

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
  
  let highlightPadding = 5;

  let finalTargetRect = targetRect ? new DOMRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height) : null;
  
  if (finalTargetRect) {
      // Manual adjustments based on user feedback
      const selector = currentStep.selector;
      
      switch (currentStep.selector) {
          // Prep Your Vibe Tour
          case '[data-tour="language-selectors"]':
              finalTargetRect.y = 200;
              break;
          case '[data-tour="voice-selector"]':
              finalTargetRect.y = 200;
              break;
          case '[data-tour="topic-selector"]':
              finalTargetRect.y -= 10;
              finalTargetRect.height += 20;
              break;
          case '[data-tour="phrase-item-0"]':
              finalTargetRect.y = 150;
              break;
          case '[data-tour="listen-button-0"]':
              finalTargetRect.y = 210;
              break;
          case '[data-tour="practice-button-0"]':
              finalTargetRect.y = 210;
              break;
          case '[data-tour="offline-manager"]':
              finalTargetRect.y = 180;
              break;

          // Live Translation Tour
          case '[data-tour="lt-language-selectors"]':
              break;
          case '[data-tour="lt-input-textarea"]':
              finalTargetRect.y = 140;
              break;
          case '[data-tour="lt-mic-button"]':
              finalTargetRect.y = 220;
              break;
          case '[data-tour="lt-output-actions"]':
              finalTargetRect.y = 220;
              break;
          case '[data-tour="lt-saved-phrases"]':
              finalTargetRect.y = 30;
              break;
        
          // Sync Live Tour
          case '[data-tour="sl-usage-card"]':
                finalTargetRect.y = 160;
                break;
          
          // Sync Online Tour
          case '[data-tour="so-schedule-button"]':
                finalTargetRect.y = 230;
                break;
          case '[data-tour="so-room-list"]':
                finalTargetRect.y = 100;
                break;
          case '[data-tour="so-start-room-0"]':
                finalTargetRect.y = 330;
                break;
          case '[data-tour="so-share-link-0"]':
                finalTargetRect.y = 330;
                break;
          case '[data-tour="so-settings-0"]':
                finalTargetRect.y = 330;
                break;
          default:
              break;
      }
  }


  return (
    <AnimatePresence>
      {isOpen && (
        <>
        <div style={{ position: 'fixed', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px', borderRadius: '5px', zIndex: 10003, fontSize: '12px', fontFamily: 'monospace' }}>
              <p>Target Rect:</p>
              {targetRect ? (
                  <>
                      <p>T: {targetRect.top.toFixed(2)}, L: {targetRect.left.toFixed(2)}</p>
                      <p>W: {targetRect.width.toFixed(2)}, H: {targetRect.height.toFixed(2)}</p>
                  </>
              ) : <p>No Target</p>}
          </div>
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
