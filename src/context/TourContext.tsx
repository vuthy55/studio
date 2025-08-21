"use client";

import * as React from "react"
import { ReactNode } from 'react';

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

const TourContext = React.createContext<TourContextType | undefined>(undefined);

export const TourProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [steps, setSteps] = React.useState<TourStep[]>([]);

  const startTour = React.useCallback((tourSteps: TourStep[]) => {
    setSteps(tourSteps);
    setStepIndex(0);
    setIsOpen(true);
  }, []);

  const stopTour = React.useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    setSteps([]);
  }, []);

  const goToNextStep = React.useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(prev => prev + 1);
    } else {
      stopTour();
    }
  }, [stepIndex, steps.length, stopTour]);

  const goToPrevStep = React.useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex(prev => prev - 1);
    }
  }, [stepIndex]);

  const goToStep = React.useCallback((index: number) => {
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
  const context = React.useContext(TourContext);
  if (context === undefined) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};
