'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import TaskInputBar from '../components/landing/TaskInputBar';
import SuggestionGrid from '../components/landing/SuggestionGrid';
import SettingsDialog from '../components/layout/SettingsDialog';
import { useTaskStore } from '../stores/taskStore';
import { getAccomplish } from '../lib/accomplish';
import { springs } from '../lib/animations';
import { hasAnyReadyProvider, BrandProfile, FileAttachment } from '@shopos/shared';

const USE_CASE_EXAMPLES = [
  {
    title: 'Product Photo Studio',
    prompt: 'Take this product image https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800 and remove the background, then place it on a clean marble countertop setting.',
  },
  {
    title: 'Launch New Product',
    prompt: 'I want to launch a new product called "Summer Breeze Dress" on my Shopify store. Remove the background from this image https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800, place it on a beach background, write compelling product copy, suggest pricing (competitors charge $65-95), and create the product on Shopify.',
  },
  {
    title: 'Competitor Price Analysis',
    prompt: 'Research pricing for summer dresses from Zara, H&M, and ASOS. Compare their price ranges and recommend a pricing strategy for my new collection.',
  },
  {
    title: 'Product Copywriter',
    prompt: 'Write compelling product descriptions for a "Minimalist Leather Wallet" - premium Italian leather, RFID blocking, slim design. Include headline, features, and a call-to-action.',
  },
  {
    title: 'Email Welcome Sequence',
    prompt: 'Create a 3-email welcome sequence for customers who just purchased from my summer collection. Include a welcome email, a product care tips email, and a cross-sell email.',
  },
  {
    title: 'Editorial Style Shot',
    prompt: 'Take my product photo https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800 and create editorial campaign-style images matching this aesthetic https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
  },
  {
    title: 'Sketch to Product',
    prompt: 'I have a sketch of a new handbag design. Turn it into a photorealistic product render with brushed gold hardware and burgundy leather finish.',
  },
  {
    title: 'Social Media Kit',
    prompt: 'Create Instagram and Facebook posts announcing the launch of our new "Coastal Collection" summer line. Include engaging captions, relevant hashtags, and suggest the best posting times.',
  },
  {
    title: 'Bulk Product Updates',
    prompt: 'Update all products in my "Winter Collection" on Shopify - add a "SALE" tag, reduce prices by 20%, and add "Limited Time Offer" to each description.',
  },
];

// Helper to generate a unique task ID
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [shopifyRefreshKey, setShopifyRefreshKey] = useState(0);
  const [brandName, setBrandName] = useState<string | null>(null);
  // Task ID for attachment uploads - must match the ID used when starting the task
  const [currentTaskId, setCurrentTaskId] = useState(generateTaskId);
  const { startTask, isLoading, addTaskUpdate, setPermissionRequest, setIntentAnalysisInProgress } = useTaskStore();
  const navigate = useNavigate();
  const accomplish = getAccomplish();

  // Fetch brand name from brand memory
  useEffect(() => {
    const fetchBrandName = async () => {
      try {
        const profile = await accomplish.getActiveBrandProfile() as BrandProfile | null;
        if (profile?.name) {
          setBrandName(profile.name);
        }
      } catch (error) {
        console.error('Failed to fetch brand profile:', error);
      }
    };
    fetchBrandName();
  }, [accomplish]);

  // Subscribe to task events
  useEffect(() => {
    const unsubscribeTask = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
    });

    const unsubscribePermission = accomplish.onPermissionRequest((request) => {
      setPermissionRequest(request);
    });

    // Subscribe to intent analysis events - only set to true, never false
    // Let Execution page handle clearing the state
    const unsubscribeIntentAnalysis = accomplish.onIntentAnalysis?.((data) => {
      if (data.status === 'analyzing') {
        setIntentAnalysisInProgress(true);
      }
    });

    return () => {
      unsubscribeTask();
      unsubscribePermission();
      unsubscribeIntentAnalysis?.();
    };
  }, [addTaskUpdate, setPermissionRequest, setIntentAnalysisInProgress, accomplish]);

  // Store pending attachments for use in executeTask
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);

  const executeTask = useCallback(async (attachments?: FileAttachment[]) => {
    if (!prompt.trim() && (!attachments || attachments.length === 0)) return;
    if (isLoading) return;

    // Set intent analysis in progress BEFORE starting task
    // This ensures the UI shows it immediately on navigation
    setIntentAnalysisInProgress(true);

    // Use the pre-generated task ID (same one used for attachment uploads)
    const taskId = currentTaskId;

    // Convert FileAttachment to TaskConfig.attachments format
    const taskAttachments = attachments?.filter(a => a.url).map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      url: a.url!,
      size: a.size,
    }));

    const task = await startTask({
      prompt: prompt.trim(),
      taskId,
      attachments: taskAttachments,
    });
    if (task) {
      // Generate new task ID for next task (after successful creation)
      setCurrentTaskId(generateTaskId());
      navigate(`/execution/${task.id}`);
    }
  }, [prompt, isLoading, startTask, navigate, currentTaskId, setIntentAnalysisInProgress]);

  const handleSubmit = async (attachments?: FileAttachment[]) => {
    if (!prompt.trim() && (!attachments || attachments.length === 0)) return;
    if (isLoading) return;

    // Store attachments for potential retry after settings dialog
    if (attachments) {
      setPendingAttachments(attachments);
    }

    // Check if any provider is ready before sending (skip in E2E mode)
    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        setShowSettingsDialog(true);
        return;
      }
    }

    await executeTask(attachments);
    setPendingAttachments([]);
  };

  const handleSettingsDialogChange = (open: boolean) => {
    setShowSettingsDialog(open);
    if (!open) {
      // Reset to default tab and refresh Shopify status when dialog closes
      setSettingsInitialTab(undefined);
      setShopifyRefreshKey(prev => prev + 1);
    }
  };

  const handleConnectStore = () => {
    setSettingsInitialTab('integrations');
    setShowSettingsDialog(true);
  };

  const handleApiKeySaved = async () => {
    // API key was saved - close dialog and execute the task
    setShowSettingsDialog(false);
    if (prompt.trim() || pendingAttachments.length > 0) {
      await executeTask(pendingAttachments.length > 0 ? pendingAttachments : undefined);
      setPendingAttachments([]);
    }
  };

  const handleExampleClick = (examplePrompt: string) => {
    setPrompt(examplePrompt);
  };

  return (
    <>
      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={handleSettingsDialogChange}
        onApiKeySaved={handleApiKeySaved}
        initialTab={settingsInitialTab}
      />
      <div className="h-full flex flex-col items-center justify-center px-6 overflow-y-auto bg-background">
        <div className="w-full max-w-4xl flex flex-col items-center">
          {/* Greeting Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="text-center mb-8"
          >
            <h1
              data-testid="home-title"
              className="text-4xl font-medium text-foreground tracking-tight"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              Hello{brandName ? ` ${brandName}` : ''},
            </h1>
            <p
              className="text-3xl text-muted-foreground mt-1 tracking-tight"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              Ready to make something that sells?
            </p>
          </motion.div>

          {/* Input Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.gentle, delay: 0.1 }}
            className="w-full mb-6"
          >
            <TaskInputBar
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              placeholder="Ask anything..."
              large={true}
              autoFocus={true}
              onConnectStore={handleConnectStore}
              shopifyRefreshKey={shopifyRefreshKey}
              taskId={currentTaskId}
            />
          </motion.div>

          {/* Suggestion Pills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.gentle, delay: 0.2 }}
            className="w-full"
          >
            <SuggestionGrid
              suggestions={USE_CASE_EXAMPLES}
              onSelect={handleExampleClick}
            />
          </motion.div>
        </div>
      </div>
    </>
  );
}
