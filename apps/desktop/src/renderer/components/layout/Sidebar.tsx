"use client";

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTaskStore } from "@/stores/taskStore";
import { getAccomplish } from "@/lib/accomplish";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import SettingsDialog from "./SettingsDialog";
import ConversationListItem from "./ConversationListItem";
import { Plus, Settings, MessageSquare } from "lucide-react";
import logoImage from "/assets/shopos-logo.svg";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const { tasks, loadTasks, updateTaskStatus, addTaskUpdate } = useTaskStore();
  const accomplish = getAccomplish();

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Subscribe to task updates
  useEffect(() => {
    const unsubscribeStatusChange = accomplish.onTaskStatusChange?.((data) => {
      updateTaskStatus(data.taskId, data.status);
    });

    const unsubscribeTaskUpdate = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
    });

    return () => {
      unsubscribeStatusChange?.();
      unsubscribeTaskUpdate();
    };
  }, [updateTaskStatus, addTaskUpdate, accomplish]);

  const handleNewConversation = () => {
    navigate("/");
  };

  return (
    <>
      <div
        className="flex h-screen w-[260px] flex-col border-r border-border pt-12 z-20"
        style={{ backgroundColor: "hsl(var(--sidebar))" }}
      >
        {/* Header with Logo */}
        <div className="px-4 pb-4 flex items-center gap-3">
          <div className="h-8 w-8 overflow-hidden">
            <img
              src={logoImage}
              alt="Shop OS"
              className="h-full w-full object-contain"
            />
          </div>
          <span className="font-semibold text-lg">Shop OS</span>
        </div>

        {/* New Chat Button */}
        <div className="px-3 pb-3">
          <Button
            data-testid="sidebar-new-task-button"
            onClick={handleNewConversation}
            size="sm"
            className="w-full justify-start gap-2 rounded-xl h-10 bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Recent Chats */}
        <div className="px-3 pb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2">
            Recent
          </span>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1">
            <AnimatePresence mode="wait">
              {tasks.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3 py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2"
                >
                  <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                  <span>No conversations yet</span>
                </motion.div>
              ) : (
                <motion.div
                  key="task-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-1"
                >
                  {tasks.map((task) => (
                    <ConversationListItem key={task.id} task={task} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Bottom Section - Settings */}
        <div className="px-3 py-4 border-t border-border">
          <Button
            data-testid="sidebar-settings-button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 rounded-xl h-10 text-muted-foreground hover:text-foreground"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
