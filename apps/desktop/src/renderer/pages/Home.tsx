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
import { hasAnyReadyProvider, BrandProfile } from '@brandwork/shared';

// Import use case images for proper bundling in production
import aiImageWizardImg from '/assets/usecases/ai-image-wizard.webp';
import competitorPricingDeckImg from '/assets/usecases/competitor-pricing-deck.png';
import landingPageCopyImg from '/assets/usecases/landing-page-copy.webp';
import courseAnnouncementImg from '/assets/usecases/course-announcement.webp';
import professionalHeadshotImg from '/assets/usecases/professional-headshot.webp';
import pitchDeckImg from '/assets/usecases/pitch-deck.webp';
import customWebToolImg from '/assets/usecases/custom-web-tool.webp';
import socialContentImg from '/assets/usecases/bilingual-output.webp';
import batchFileRenamingImg from '/assets/usecases/batch-file-renaming.webp';

const USE_CASE_EXAMPLES = [
  {
    title: 'Product Photo Studio',
    description: 'Remove backgrounds and create lifestyle product shots.',
    prompt: 'Take this product image https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800 and remove the background, then place it on a clean marble countertop setting.',
    image: aiImageWizardImg,
  },
  {
    title: 'Launch New Product',
    description: 'Create a complete product listing with copy and images.',
    prompt: 'I want to launch a new product called "Summer Breeze Dress" on my Shopify store. Remove the background from this image https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800, place it on a beach background, write compelling product copy, suggest pricing (competitors charge $65-95), and create the product on Shopify.',
    image: pitchDeckImg,
  },
  {
    title: 'Competitor Price Analysis',
    description: 'Research competitor pricing and get recommendations.',
    prompt: 'Research pricing for summer dresses from Zara, H&M, and ASOS. Compare their price ranges and recommend a pricing strategy for my new collection.',
    image: competitorPricingDeckImg,
  },
  {
    title: 'Product Copywriter',
    description: 'Generate SEO-optimized product descriptions.',
    prompt: 'Write compelling product descriptions for a "Minimalist Leather Wallet" - premium Italian leather, RFID blocking, slim design. Include headline, features, and a call-to-action.',
    image: landingPageCopyImg,
  },
  {
    title: 'Email Welcome Sequence',
    description: 'Create automated email flows for new customers.',
    prompt: 'Create a 3-email welcome sequence for customers who just purchased from my summer collection. Include a welcome email, a product care tips email, and a cross-sell email.',
    image: courseAnnouncementImg,
  },
  {
    title: 'Editorial Style Shot',
    description: 'Match your products to campaign-style photography.',
    prompt: 'Take my product photo https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800 and create editorial campaign-style images matching this aesthetic https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
    image: professionalHeadshotImg,
  },
  {
    title: 'Sketch to Product',
    description: 'Turn product sketches into photorealistic renders.',
    prompt: 'I have a sketch of a new handbag design. Turn it into a photorealistic product render with brushed gold hardware and burgundy leather finish.',
    image: customWebToolImg,
  },
  {
    title: 'Social Media Kit',
    description: 'Create posts for product launches.',
    prompt: 'Create Instagram and Facebook posts announcing the launch of our new "Coastal Collection" summer line. Include engaging captions, relevant hashtags, and suggest the best posting times.',
    image: socialContentImg,
  },
  {
    title: 'Bulk Product Updates',
    description: 'Update multiple products on Shopify at once.',
    prompt: 'Update all products in my "Winter Collection" on Shopify - add a "SALE" tag, reduce prices by 20%, and add "Limited Time Offer" to each description.',
    image: batchFileRenamingImg,
  },
];

export default function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [shopifyRefreshKey, setShopifyRefreshKey] = useState(0);
  const [brandName, setBrandName] = useState<string | null>(null);
  const { startTask, isLoading, addTaskUpdate, setPermissionRequest } = useTaskStore();
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

    return () => {
      unsubscribeTask();
      unsubscribePermission();
    };
  }, [addTaskUpdate, setPermissionRequest, accomplish]);

  const executeTask = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    const taskId = `task_${Date.now()}`;
    const task = await startTask({ prompt: prompt.trim(), taskId });
    if (task) {
      navigate(`/execution/${task.id}`);
    }
  }, [prompt, isLoading, startTask, navigate]);

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading) return;

    // Check if any provider is ready before sending (skip in E2E mode)
    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        setShowSettingsDialog(true);
        return;
      }
    }

    await executeTask();
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
    if (prompt.trim()) {
      await executeTask();
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
      <div className="h-full flex flex-col items-center p-6 pt-16 overflow-y-auto bg-accent">
        {/* Greeting Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          className="text-center mb-8"
        >
          <h1
            data-testid="home-title"
            className="text-3xl font-medium text-foreground mb-2"
          >
            Hello{brandName ? ` ${brandName}` : ''}
          </h1>
          <p className="text-xl text-muted-foreground">
            What are you going to sell today?
          </p>
        </motion.div>

        {/* Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springs.gentle, delay: 0.1 }}
          className="w-full max-w-2xl mb-12"
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
          />
        </motion.div>

        {/* Suggestions Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springs.gentle, delay: 0.2 }}
          className="w-full max-w-5xl"
        >
          <SuggestionGrid
            suggestions={USE_CASE_EXAMPLES}
            onSelect={handleExampleClick}
          />
        </motion.div>
      </div>
    </>
  );
}
