'use client';

import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { isRunningInElectron, getAccomplish } from './lib/accomplish';
import { springs, variants } from './lib/animations';
import { analytics } from './lib/analytics';
import type { BrandProfile } from '@brandwork/shared';

// Pages
import HomePage from './pages/Home';
import ExecutionPage from './pages/Execution';
import HistoryPage from './pages/History';

// Components
import Sidebar from './components/layout/Sidebar';
import { TaskLauncher } from './components/TaskLauncher';
import { BrandOnboarding } from './components/onboarding/BrandOnboarding';
import { Toaster } from './components/ui/sonner';
import { useTaskStore } from './stores/taskStore';
import { Loader2, AlertTriangle } from 'lucide-react';

type AppStatus = 'loading' | 'onboarding' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const location = useLocation();

  // Get launcher actions
  const { openLauncher } = useTaskStore();

  // Track page views on route changes
  useEffect(() => {
    analytics.trackPageView(location.pathname);
  }, [location.pathname]);

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openLauncher();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openLauncher]);

  useEffect(() => {
    const checkStatus = async () => {
      // Check if running in Electron
      if (!isRunningInElectron()) {
        setErrorMessage('This application must be run inside the BrandWork desktop app.');
        setStatus('error');
        return;
      }

      try {
        const accomplish = getAccomplish();
        const onboardingComplete = await accomplish.getOnboardingComplete();
        
        if (onboardingComplete) {
          // Load saved brand profile from storage
          const savedProfile = await accomplish.getActiveBrandProfile() as BrandProfile | null;
          if (savedProfile) {
            setBrandProfile(savedProfile);
          }
          setStatus('ready');
        } else {
          // Show brand onboarding
          setStatus('onboarding');
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        // Show onboarding if we can't determine status
        setStatus('onboarding');
      }
    };

    checkStatus();
  }, []);

  const handleOnboardingComplete = async (profile: BrandProfile) => {
    try {
      const accomplish = getAccomplish();
      // Save brand profile to SQLite
      await accomplish.saveBrandProfile(profile);
      await accomplish.setActiveBrandProfile(profile.id);
      setBrandProfile(profile);
      await accomplish.setOnboardingComplete(true);
      setStatus('ready');
      console.log('Brand onboarding complete:', profile);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      // Still proceed to app
      setBrandProfile(profile);
      setStatus('ready');
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-foreground">Unable to Start</h1>
          <p className="text-muted-foreground">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // Onboarding state
  if (status === 'onboarding') {
    return <BrandOnboarding onComplete={handleOnboardingComplete} />;
  }

  // Ready - render the app with sidebar
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Invisible drag region for window dragging (macOS hiddenInset titlebar) */}
      <div className="drag-region fixed top-0 left-0 right-0 h-10 z-50 pointer-events-none" />
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                <motion.div
                  className="h-full"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={variants.fadeUp}
                  transition={springs.gentle}
                >
                  <HomePage />
                </motion.div>
              }
            />
            <Route
              path="/execution/:id"
              element={
                <motion.div
                  className="h-full"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={variants.fadeUp}
                  transition={springs.gentle}
                >
                  <ExecutionPage />
                </motion.div>
              }
            />
            <Route
              path="/history"
              element={
                <motion.div
                  className="h-full"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={variants.fadeUp}
                  transition={springs.gentle}
                >
                  <HistoryPage />
                </motion.div>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>
      <TaskLauncher />
      <Toaster />
    </div>
  );
}
