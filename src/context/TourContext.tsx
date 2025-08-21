"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface TourStep {
  selector: string;
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface TourContextType {
  isOpen: boolean;
  stepIndex: number;
  steps: TourStep[];
  currentStep: TourStep | null;
  startTour: (steps: TourStep[]) => void;
  stopTour: () => void;
  goToNextStep: () => void;
  goToPrevStep: () => void;
  goToStep: (index: number) => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export const TourProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);

  const startTour = useCallback((tourSteps: TourStep[]) => {
    setSteps(tourSteps);
    setStepIndex(0);
    setIsOpen(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    setSteps([]);
  }, []);

  const goToNextStep = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(prev => prev + 1);
    } else {
      stopTour();
    }
  }, [stepIndex, steps.length, stopTour]);

  const goToPrevStep = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex(prev => prev - 1);
    }
  }, [stepIndex]);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < steps.length) {
      setStepIndex(index);
    }
  }, [steps.length]);

  const currentStep = isOpen ? steps[stepIndex] : null;

  const value = {
    isOpen,
    stepIndex,
    steps,
    currentStep,
    startTour,
    stopTour,
    goToNextStep,
    goToPrevStep,
    goToStep,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => {
  const context = useContext(TourContext);
  if (context === undefined) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};
