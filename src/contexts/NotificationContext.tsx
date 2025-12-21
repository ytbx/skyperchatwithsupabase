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
   * Check if server is muted (via localStorage)
   */
  const isServerMuted = useCallback((serverId: string): boolean => {
    // Check localStorage directly for reliability
    try {
      const stored = localStorage.getItem('muted_servers');
      if (stored) {
        const mutedServers: string[] = JSON.parse(stored);
        return mutedServers.includes(serverId);
      }
    } catch { }
    return false;
  }, []);

  /**
   * Check if user notifications are muted (via window.isUserNotificationsMuted from UserVolumeContextMenu)
   */
  const isUserNotificationsMuted = useCallback((userId: string): boolean => {
    // Also check localStorage directly since window function might not be initialized yet
    try {
      const stored = localStorage.getItem('muted_users_notifications');
      if (stored) {
        const mutedUsers: string[] = JSON.parse(stored);
        return mutedUsers.includes(userId);
      }
    } catch { }
    return false;
  }, []);

  /**
   * Add notification to local state and show browser notification
   * (Does NOT save to DB - that is handled by the sender)
   */
  const addNotification = useCallback((
    notification: Notification
  ) => {
    // Check if this notification is from a muted server
    const serverId = notification.data?.serverId;
    if (serverId && isServerMuted(serverId)) {
      console.log('[Notifications] Skipping notification from muted server:', serverId);
      return; // Completely skip - don't add to state or show anything
    }

    // Check if this notification is from a muted user (for DMs)
    const senderId = notification.data?.senderId;
    if (senderId && isUserNotificationsMuted(senderId)) {
      console.log('[Notifications] Skipping notification from muted user:', senderId);
      return; // Completely skip - don't add to state or show anything
    }

    setNotifications((prev) => [notification, ...prev].slice(0, 100)); // Keep last 100

    // Play sound
    playNotificationSound();

    // Show browser notification
    showBrowserNotification(notification.title, notification.body, notification.data);

    console.log('[Notifications] Received:', notification.type, notification.title);
  }, [playNotificationSound, showBrowserNotification, isServerMuted, isUserNotificationsMuted]);

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
        async (payload) => {
          console.log('[Notifications] Received notification INSERT:', payload);
          const newNotification = payload.new as any;

          // Check if this notification is from a muted server
          const serverId = newNotification.metadata?.serverId;
          if (serverId && isServerMuted(serverId)) {
            console.log('[Notifications] Deleting notification from muted server:', serverId);
            // Delete from DB so it doesn't persist
            await supabase.from('notifications').delete().eq('id', newNotification.id);
            return;
          }

          // Check if this notification is from a muted user
          const senderId = newNotification.metadata?.senderId;
          if (senderId && isUserNotificationsMuted(senderId)) {
            console.log('[Notifications] Deleting notification from muted user:', senderId);
            // Delete from DB so it doesn't persist
            await supabase.from('notifications').delete().eq('id', newNotification.id);
            return;
          }

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
      channel.unsubscribe();
    };
  }, [currentUserId, addNotification, isServerMuted, isUserNotificationsMuted]);

  /**
   * Subscribe to incoming DM messages (receiver-side notification generation)
   * This handles notifications when sender is online and didn't create a DB notification
   */
  useEffect(() => {
    if (!currentUserId) return;

    console.log('[Notifications] Setting up DM notifications subscription for user:', currentUserId);

    const dmChannel = supabase
      .channel('dm-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const newMessage = payload.new as any;
          console.log('[Notifications] Received DM:', newMessage);

          // Aktif chat'den geliyorsa bildirim gösterme
          if (newMessage.sender_id === activeContactId) {
            console.log('[Notifications] Message from active chat, skipping notification');
            return;
          }

          // Check if user notifications are muted (BEFORE creating DB entry)
          if (isUserNotificationsMuted(newMessage.sender_id)) {
            console.log('[Notifications] Skipping DM notification from muted user:', newMessage.sender_id);
            return;
          }

          console.log('[Notifications] Message from inactive chat, creating notification');

          // Gönderen profil bilgisini al
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', newMessage.sender_id)
            .single();

          const notificationData = {
            user_id: currentUserId,
            type: 'message' as const,
            title: 'Yeni Direkt Mesaj',
            message: `${senderProfile?.username || 'Birisi'}: ${newMessage.message || 'Dosya gönderdi'}`,
            metadata: { type: 'dm', senderId: newMessage.sender_id }
          };

          // Bildirimi DB'ye yaz (NotificationSystem kutusunda görünmesi için)
          // DB insert -> notification subscription -> addNotification -> ses çalar
          const { error } = await supabase.from('notifications').insert(notificationData);

          if (error) {
            console.error('[Notifications] Error inserting notification:', error);
          } else {
            console.log('[Notifications] Notification inserted to DB');
          }
        }
      )
      .subscribe((status) => {
        console.log('[Notifications] DM subscription status:', status);
      });

    return () => {
      console.log('[Notifications] Cleaning up DM subscription');
      dmChannel.unsubscribe();
    };
  }, [currentUserId, activeContactId, isUserNotificationsMuted]);

  /**
   * State to track current user's profile for mention detection
   */
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

  // Load current user's username
  useEffect(() => {
    if (!currentUserId) return;

    const loadUsername = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', currentUserId)
        .single();

      if (data?.username) {
        setCurrentUsername(data.username);
      }
    };

    loadUsername();
  }, [currentUserId]);

  /**
   * Subscribe to channel messages for mention detection (receiver-side)
   */
  useEffect(() => {
    if (!currentUserId || !currentUsername) return;

    console.log('[Notifications] Setting up channel message subscription for mentions');

    const channelMessageSub = supabase
      .channel('channel-message-mentions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
        },
        async (payload) => {
          const newMessage = payload.new as any;

          // Skip own messages
          if (newMessage.sender_id === currentUserId) return;

          // Skip if viewing the same channel (optional - could check activeChannelId)

          const messageContent = newMessage.message || '';

          // Check for @everyone or @username mention
          const isMentioned = messageContent.includes('@everyone') ||
            messageContent.toLowerCase().includes(`@${currentUsername.toLowerCase()}`);

          if (!isMentioned) return;

          console.log('[Notifications] Detected mention in message:', newMessage.id);

          // Get channel info to find server_id
          const { data: channelData } = await supabase
            .from('channels')
            .select('server_id, name')
            .eq('id', newMessage.channel_id)
            .single();

          if (!channelData) {
            console.log('[Notifications] Could not find channel for message');
            return;
          }

          // Check if user is member of this server
          const { data: membership } = await supabase
            .from('server_users')
            .select('user_id')
            .eq('server_id', channelData.server_id)
            .eq('user_id', currentUserId)
            .single();

          if (!membership) {
            console.log('[Notifications] User is not member of this server');
            return;
          }

          // CHECK MUTE STATUS BEFORE CREATING NOTIFICATION
          if (isServerMuted(channelData.server_id)) {
            console.log('[Notifications] Skipping mention notification - server is muted:', channelData.server_id);
            return;
          }

          // Get sender info
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', newMessage.sender_id)
            .single();

          // Create notification data for DB (NotificationSystem reads from DB)
          // Note: DB constraint only allows 'message', 'friend_request', 'call', 'server_invite'
          // We use 'message' type and store 'mention' in metadata.type
          const notificationDbData = {
            user_id: currentUserId,
            type: 'message' as const,
            title: messageContent.includes('@everyone')
              ? `Everyone (${senderProfile?.username || 'Birisi'})`
              : 'Sizden bahsedildi',
            message: `${senderProfile?.username || 'Birisi'}: ${messageContent.substring(0, 100)}`,
            metadata: {
              type: 'mention',
              channelId: newMessage.channel_id,
              messageId: newMessage.id,
              serverId: channelData.server_id
            }
          };

          console.log('[Notifications] Inserting mention notification to DB:', notificationDbData);

          // Insert to DB so NotificationSystem can display it
          const { error } = await supabase.from('notifications').insert(notificationDbData);

          if (error) {
            console.error('[Notifications] Error inserting mention notification:', error);
          } else {
            console.log('[Notifications] Mention notification inserted to DB successfully');
            // We rely on the DB subscription to pick this up and call addNotification
            // This prevents double sounds/notifications
          }
        }
      )
      .subscribe((status) => {
        console.log('[Notifications] Channel message subscription status:', status);
      });

    return () => {
      console.log('[Notifications] Cleaning up channel message subscription');
      channelMessageSub.unsubscribe();
    };
  }, [currentUserId, currentUsername, addNotification, isServerMuted]);

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
        // Filter out muted notifications and collect IDs to delete
        const mutedNotificationIds: string[] = [];
        const filteredData = data.filter(n => {
          const serverId = n.metadata?.serverId;
          const senderId = n.metadata?.senderId;

          if (serverId && isServerMuted(serverId)) {
            mutedNotificationIds.push(n.id);
            return false;
          }
          if (senderId && isUserNotificationsMuted(senderId)) {
            mutedNotificationIds.push(n.id);
            return false;
          }
          return true;
        });

        // Delete muted notifications from DB
        if (mutedNotificationIds.length > 0) {
          console.log('[Notifications] Deleting muted notifications:', mutedNotificationIds.length);
          await supabase.from('notifications').delete().in('id', mutedNotificationIds);
        }

        const loadedNotifications: Notification[] = filteredData.map(n => ({
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
    };

    initialize();
  }, []); // ✅ Empty dependency array - only run once on mount

  // Add debug methods separately without notifications dependency
  useEffect(() => {
    (window as any).debugNotifications = {
      testNotification: createTestNotification,
      getNotifications: () => notifications,
      getStatus: () => ({ userId: currentUserId, count: notifications.length, hasPermission }),
      clearAll: clearAll,
    };

    console.log('[Notifications] Debug methods updated');
  }, [currentUserId, hasPermission, createTestNotification, clearAll]); // ✅ Removed notifications dependency

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
