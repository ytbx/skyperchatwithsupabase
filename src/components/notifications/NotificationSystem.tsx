import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, X, MessageCircle, UserPlus, Phone, Trash2 } from 'lucide-react';

interface Notification {
  id: string;
  user_id: string;
  type: 'message' | 'friend_request' | 'call' | 'server_invite' | 'mention';
  title: string;
  message: string;
  created_at: string;
  metadata?: {
    sender_id?: string;
    sender_name?: string;
    call_type?: 'voice' | 'video';
    server_id?: string;
    channelId?: string;
    serverId?: string;
    senderId?: string;
    type?: string;
  };
}

interface NotificationSystemProps {
  onNavigate?: (type: 'channel' | 'dm', id: string, serverId?: string) => void;
}

export const NotificationSystem: React.FC<NotificationSystemProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (user) {
      loadNotifications();

      // Setup realtime subscription with proper cleanup
      const subscription = supabase
        .channel('notification-system-ui')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[NotificationSystem] Received notification from DB:', payload.new);
            const newNotification = payload.new as Notification;
            setNotifications(prev => [newNotification, ...prev]);

            // Show browser notification if permission granted
            if (Notification.permission === 'granted') {
              new Notification(newNotification.title, {
                body: newNotification.message,
                icon: '/logo.png'
              });
            }
          }
        )
        .subscribe((status) => {
          console.log('[NotificationSystem] Subscription status:', status);
        });

      // Return cleanup function
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  useEffect(() => {
    setNotificationCount(notifications.length);
  }, [notifications]);

  const loadNotifications = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };





  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const deleteNotification = async (notificationId: string) => {
    console.log('🗑️ Attempting to delete notification:', notificationId);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .select();

      if (error) {
        console.error('❌ Supabase delete error:', error);
        alert(`Bildirim silinemedi: ${error.message}`);
        throw error;
      }

      if (data && data.length === 0) {
        console.warn('⚠️ Delete operation returned 0 rows. This usually means RLS policy is missing.');
        alert('Bildirim silinemedi! Veritabanı izni eksik olabilir.\n\nLütfen Supabase SQL editöründe şu komutu çalıştırın:\n\nCREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);');
        return;
      }

      console.log('✅ Notification deleted from DB:', data);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
    }
  };

  const deleteAllNotifications = async () => {
    if (!user) return;

    console.log('🗑️ Attempting to delete all notifications for user:', user.id);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .select();

      if (error) {
        console.error('❌ Supabase delete all error:', error);
        alert(`Tüm bildirimler silinemedi: ${error.message}`);
        throw error;
      }

      // Check if RLS blocked the delete
      if (data && data.length === 0) {
        console.warn('⚠️ Delete operation returned 0 rows. This usually means RLS policy is missing.');
        alert('Bildirimler silinemedi! Veritabanı izni eksik olabilir.\n\nLütfen Supabase SQL editöründe şu komutu çalıştırın:\n\nCREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);');
        return;
      }

      console.log('✅ All notifications deleted from DB:', data);
      setNotifications([]);
    } catch (error) {
      console.error('❌ Error deleting all notifications:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'message':
        return <MessageCircle size={18} className="text-blue-400" />;
      case 'friend_request':
        return <UserPlus size={18} className="text-green-400" />;
      case 'call':
        return <Phone size={18} className="text-purple-400" />;
      default:
        return <Bell size={18} className="text-gray-400" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Şimdi';
    if (diffInMinutes < 60) return `${diffInMinutes}dk önce`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}sa önce`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}g önce`;

    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-700 rounded-lg transition-colors"
      >
        <Bell size={20} className="text-gray-400" />
        {notificationCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
            {notificationCount > 99 ? '99+' : notificationCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">Bildirimler</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center">
                  <Bell size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-sm">Henüz bildiriminiz yok</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="p-4 hover:bg-gray-800 transition-colors cursor-pointer"
                      onClick={() => {
                        if (onNavigate) {
                          if (notification.type === 'message' || notification.type === 'mention') {
                            if (notification.metadata?.channelId) {
                              onNavigate('channel', notification.metadata.channelId, notification.metadata.serverId);
                              setIsOpen(false);
                              deleteNotification(notification.id);
                            } else if (notification.metadata?.senderId) {
                              onNavigate('dm', notification.metadata.senderId);
                              setIsOpen(false);
                              deleteNotification(notification.id);
                            }
                          }
                        }
                      }}
                    >
                      <div className="flex items-start space-x-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-white">
                            {notification.title}
                          </h4>
                          <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {formatTime(notification.created_at)}
                            </span>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                              }}
                              className="p-1.5 hover:bg-red-600/20 rounded transition-colors group"
                              title="Sil"
                            >
                              <X size={14} className="text-red-400 group-hover:text-red-300" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {
              notifications.length > 0 && (
                <div className="p-3 border-t border-gray-700 text-center">
                  <button
                    onClick={deleteAllNotifications}
                    className="flex items-center justify-center gap-2 w-full text-sm text-red-400 hover:text-red-300 transition-colors py-1"
                  >
                    <Trash2 size={14} />
                    Tüm bildirimleri sil
                  </button>
                </div>
              )
            }
          </div >
        </>
      )}
    </div >
  );
};

// Utility function to create notifications
export const createNotification = async (
  userId: string,
  type: 'message' | 'friend_request' | 'call' | 'server_invite' | 'mention',
  title: string,
  message: string,
  metadata?: any
) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        metadata
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};