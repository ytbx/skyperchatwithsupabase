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
   * Add notification
   */
  const addNotification = useCallback(async (
    type: Notification['type'],
    title: string,
    body: string,
    data?: any
  ) => {
    if (!currentUserId) return;

    // Create local notification
    const notification: Notification = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      title,
      body,
      timestamp: new Date(),
      read: false,
      data,
    };

    setNotifications((prev) => [notification, ...prev].slice(0, 100)); // Keep last 100

    // Create persistent notification in database
    try {
      await supabase
        .from('notifications')
        .insert({
          user_id: currentUserId,
          type,
          title,
          message: body,
          is_read: false,
          metadata: data
        });
    } catch (error) {
      console.error('[Notifications] Failed to save to database:', error);
    }

    // Play sound
    playNotificationSound();

    // Show browser notification
    showBrowserNotification(title, body, data);

    console.log('[Notifications] Added:', type, title);
  }, [currentUserId, playNotificationSound, showBrowserNotification]);

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
    addNotification(
      'system',
      'Test Bildirimi',
      'Bu bir test bildirimidir - bildirim sistemi çalışıyorsa görünecektir',
      { type: 'test' }
    );
  }, [addNotification]);

  /**
   * Set active chat (to prevent notifications from current conversation)
   */
  const setActiveChat = useCallback((contactId: string | null) => {
    console.log('[Notifications] Active chat set to:', contactId);
    setActiveContactId(contactId);
  }, []);

  /**
   * Check if should notify (don't notify if user is viewing the channel or chatting with the sender)
   */
  const shouldNotify = useCallback((channelId?: string, senderId?: string) => {
    // Don't notify if user is viewing the channel where message was sent
    if (currentView && currentView.type === 'channel' && currentView.id === channelId) {
      console.log('[Notifications] Skipping - user is viewing this channel');
      return false;
    }

    // Don't notify if user is chatting with this person (DM)
    if (senderId && activeContactId === senderId) {
      console.log('[Notifications] Skipping - user is chatting with this person:', senderId);
      return false;
    }

    return true;
  }, [currentView, activeContactId]);

  /**
   * Subscribe to new channel messages
   */
  useEffect(() => {
    if (!currentUserId) return;

    console.log('[Notifications] Setting up channel_messages subscription for user:', currentUserId);

    const channel = supabase
      .channel('notifications-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
        },
        async (payload) => {
          console.log('[Notifications] Received channel_messages INSERT:', payload);

          const newMessage = payload.new as any;

          // Don't notify for own messages
          if (newMessage.sender_id === currentUserId) {
            console.log('[Notifications] Skipping own message:', newMessage.id);
            return;
          }

          // Check if should notify
          if (!shouldNotify(newMessage.channel_id)) {
            console.log('[Notifications] Skipping notification (user is viewing channel):', newMessage.channel_id);
            return;
          }

          // Get sender profile information
          try {
            const { data: senderProfile, error: profileError } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', newMessage.sender_id)
              .maybeSingle();

            if (profileError) {
              console.error('[Notifications] Profile fetch error:', profileError);
              return;
            }

            const senderName = senderProfile?.username || 'Birisi';

            // Check if it's a mention
            const isMention = newMessage.message?.includes(`<@${currentUserId}>`);

            if (isMention) {
              console.log('[Notifications] Creating mention notification');
              addNotification(
                'mention',
                'Bahsedildiniz',
                `${senderName} sizi bir mesajda bahsetti`,
                { type: 'mention', channelId: newMessage.channel_id, messageId: newMessage.id }
              );
            } else {
              // Regular message notification
              console.log('[Notifications] Creating channel message notification');
              addNotification(
                'message',
                'Yeni Kanal Mesajı',
                `${senderName}: ${newMessage.message?.substring(0, 50) || 'Yeni mesaj'}${newMessage.message?.length > 50 ? '...' : ''}`,
                { type: 'message', channelId: newMessage.channel_id, messageId: newMessage.id }
              );
            }
          } catch (error) {
            console.error('[Notifications] Error processing message notification:', error);
          }
        }
      )
      .subscribe((status) => {
        console.log('[Notifications] Channel messages subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Notifications] ✅ Channel messages subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Notifications] ❌ Channel messages subscription failed');
        }
      });

    return () => {
      console.log('[Notifications] Cleaning up channel messages subscription');
      supabase.removeChannel(channel);
    };
  }, [currentUserId, shouldNotify, addNotification]);

  /**
   * Subscribe to direct messages (chats table)
   */
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('notifications-dms')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const dm = payload.new as any;

          // Check if should notify
          if (!shouldNotify(undefined, dm.sender_id)) return;

          // Get sender profile information
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', dm.sender_id)
            .maybeSingle();

          const senderName = senderProfile?.username || 'Birisi';

          addNotification(
            'message',
            'Yeni Direkt Mesaj',
            `${senderName}: ${dm.message?.substring(0, 50) || 'Yeni mesaj'}${dm.message?.length > 50 ? '...' : ''}`,
            { type: 'dm', senderId: dm.sender_id, messageId: dm.id }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, shouldNotify, addNotification]);

  /**
   * Subscribe to incoming calls
   */
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('notifications-calls')
      .on(
        'broadcast',
        { event: 'webrtc-signal' },
        async (payload) => {
          const signal = payload.payload as any;

          // Check if this is an incoming call signal for us
          if (signal.type === 'call:outgoing' && signal.to === currentUserId) {
            // Get caller profile information
            const { data: callerProfile } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', signal.from)
              .maybeSingle();

            const callerName = callerProfile?.username || 'Birisi';
            const callType = signal.callType || 'voice';

            addNotification(
              'call',
              'Gelen Arama',
              `${callerName} seni ${callType === 'video' ? 'görüntülü' : 'sesli'} arıyor`,
              {
                type: 'call',
                callerId: signal.from,
                callerName,
                callType
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, addNotification]);

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
