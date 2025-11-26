import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  type: 'message' | 'mention' | 'call' | 'system';
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
  data?: any;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearNotification: (notificationId: string) => void;
  clearAll: () => void;
  requestPermission: () => Promise<boolean>;
  hasPermission: boolean;
  // Set active chat to prevent notifications from current conversation
  setActiveChat: (contactId: string | null) => void;
  // Debug functions
  createTestNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('[DEBUG] 🔔 NotificationProvider MOUNTED!');

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<{ type: string; id?: string } | null>(null);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);

  /**
   * Request browser notification permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('[Notifications] Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      setHasPermission(true);
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      setHasPermission(granted);
      return granted;
    }

    return false;
  }, []);

  /**
   * Play notification sound
   */
  const playNotificationSound = useCallback(() => {
    try {
      // Create audio context if not exists
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant notification sound (two tones)
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.error('[Notifications] Failed to play sound:', error);
    }
  }, []);

  /**
   * Show browser notification
   */
  const showBrowserNotification = useCallback((title: string, body: string, data?: any) => {
    if (!hasPermission) return;

    try {
      const notification = new Notification(title, {
        body,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: data?.id || 'default',
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();

        // Handle notification click (navigate to relevant view)
        if (data?.type === 'message' && data?.channelId) {
          // You can emit an event here to navigate to the channel
          console.log('[Notifications] Navigate to channel:', data.channelId);
        }
      };
    } catch (error) {
      console.error('[Notifications] Failed to show notification:', error);
    }
  }, [hasPermission]);

  /**
   * Add notification to local state and show browser notification
   * (Does NOT save to DB - that is handled by the sender)
   */
  const addNotification = useCallback((
    notification: Notification
  ) => {
    setNotifications((prev) => [notification, ...prev].slice(0, 100)); // Keep last 100

    // Play sound
    playNotificationSound();

    // Show browser notification
    showBrowserNotification(notification.title, notification.body, notification.data);

    console.log('[Notifications] Received:', notification.type, notification.title);
  }, [playNotificationSound, showBrowserNotification]);

  /**
   * Mark notification as read
   */
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  /**
   * Mark all as read
   */
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  /**
   * Clear notification
   */
  const clearNotification = useCallback((notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  }, []);

  /**
   * Clear all notifications
   */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  /**
   * Create test notification (for debugging)
   */
  const createTestNotification = useCallback(() => {
    console.log('[Notifications] 🔧 Creating test notification');
    addNotification({
      id: `test-${Date.now()}`,
      type: 'system',
      title: 'Test Bildirimi',
      body: 'Bu bir test bildirimidir',
      timestamp: new Date(),
      read: false,
      data: { type: 'test' }
    });
  }, [addNotification]);

  /**
   * Set active chat (to prevent notifications from current conversation)
   */
  const setActiveChat = useCallback((contactId: string | null) => {
    console.log('[Notifications] Active chat set to:', contactId);
    setActiveContactId(contactId);
  }, []);

  /**
   * Subscribe to my notifications
   */
  useEffect(() => {
    if (!currentUserId) return;

    console.log('[Notifications] Setting up notifications subscription for user:', currentUserId);

    const channel = supabase
      .channel('my-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          console.log('[Notifications] Received notification INSERT:', payload);
          const newNotification = payload.new as any;

          // Convert DB record to local Notification object
          const notification: Notification = {
            id: newNotification.id,
            type: newNotification.type,
            title: newNotification.title,
            body: newNotification.message, // DB column is 'message', local is 'body'
            timestamp: new Date(newNotification.created_at),
            read: false,
            data: newNotification.metadata
          };

          addNotification(notification);
        }
      )
      .subscribe((status) => {
        console.log('[Notifications] Subscription status:', status);
      });

    return () => {
      console.log('[Notifications] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [currentUserId, addNotification]);

  /**
   * Load initial notifications
   */
  useEffect(() => {
    if (!currentUserId) return;

    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[Notifications] Error loading notifications:', error);
        return;
      }

      if (data) {
        const loadedNotifications: Notification[] = data.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.message,
          timestamp: new Date(n.created_at),
          read: n.is_read || false, // Handle potential schema difference if is_read exists
          data: n.metadata
        }));
        setNotifications(loadedNotifications);
      }
    };

    loadNotifications();
  }, [currentUserId]);

  /**
   * Initialize
   */
  useEffect(() => {
    const initialize = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      // Check if already has permission
      if ('Notification' in window && Notification.permission === 'granted') {
        setHasPermission(true);
      }

      console.log('[Notifications] Initialized for user:', user.id);

      // Add debug methods to window for testing
      (window as any).debugNotifications = {
        testNotification: createTestNotification,
        getNotifications: () => notifications,
        getStatus: () => ({ userId: currentUserId, count: notifications.length, hasPermission }),
        clearAll: clearAll,
      };

      console.log('[Notifications] Debug methods added to window.debugNotifications');
    };

    initialize();
  }, [notifications, currentUserId, createTestNotification, clearAll]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
    requestPermission,
    hasPermission,
    setActiveChat,
    createTestNotification,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
