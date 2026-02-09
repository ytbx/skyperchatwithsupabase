import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile } from '../../lib/types';
import { useSupabaseRealtime } from '../../contexts/SupabaseRealtimeContext';
import { Search, Plus, MessageCircle, Phone, Video, MoreVertical, Hash, UserPlus } from 'lucide-react';

interface DirectMessage {
  id: string;
  message: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  is_image: boolean;
}

interface DMConversation {
  contactId: string;
  contactName: string;
  contactAvatar: string | null;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  isOnline: boolean;
}

interface DirectMessagesListProps {
  onConversationSelect: (contactId: string, contactName: string) => void;
  onStartCall: (contactId: string, contactName: string, callType: 'voice' | 'video') => void;
  selectedContactId?: string;
}

export const DirectMessagesList: React.FC<DirectMessagesListProps> = ({
  onConversationSelect,
  onStartCall,
  selectedContactId
}) => {
  const { user } = useAuth();
  const { isUserOnline, getUserStatus } = useSupabaseRealtime();
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddFriend, setShowAddFriend] = useState(false);

  useEffect(() => {
    if (user) {
      loadConversations();
      setupRealtimeSubscription();
    }
  }, [user?.id]);

  const loadConversations = async () => {
    if (!user) return;

    try {
      // Get all chats where user is sender or receiver
      const { data: chats, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (chatsError) throw chatsError;

      // Group chats by contact and get latest message for each
      const conversationMap = new Map<string, DMConversation>();

      for (const chat of chats || []) {
        const contactId = chat.sender_id === user.id ? chat.receiver_id : chat.sender_id;

        if (!conversationMap.has(contactId)) {
          // Get contact profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, profile_image_url')
            .eq('id', contactId)
            .single();

          conversationMap.set(contactId, {
            contactId,
            contactName: profile?.username || 'Unknown User',
            contactAvatar: profile?.profile_image_url || null,
            lastMessage: chat,
            unreadCount: 0,
            isOnline: false // Will be updated by presence
          });
        }
      }

      // Calculate unread counts
      for (const [contactId, conversation] of conversationMap) {
        const { count } = await supabase
          .from('chats')
          .select('*', { count: 'exact', head: true })
          .eq('sender_id', contactId)
          .eq('receiver_id', user.id)
          .eq('is_read', false);

        conversation.unreadCount = count || 0;
      }

      setConversations(Array.from(conversationMap.values()));
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user) return;

    // Subscribe to new messages
    const subscription = supabase
      .channel('dm_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
          filter: `receiver_id=eq.${user.id}`
        },
        () => {
          loadConversations(); // Reload conversations when new message arrives
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const filteredConversations = conversations.filter(conv =>
    conv.contactName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Dün';
    } else {
      return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }
  };

  const truncateMessage = (message: string, maxLength: number = 35) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className="w-72 bg-gray-900 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-white font-semibold">Direkt Mesajlar</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold flex items-center">
            <MessageCircle size={20} className="mr-2" />
            Direkt Mesajlar
          </h2>
          <button
            onClick={() => setShowAddFriend(!showAddFriend)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <Plus size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Kişi ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Add Friend Panel */}
      {showAddFriend && (
        <div className="p-4 border-b border-gray-700 bg-gray-800/50">
          <div className="text-center">
            <UserPlus size={24} className="text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400 mb-3">Arkadaş eklemek için kullanıcı adını gir</p>
            <input
              type="text"
              placeholder="Kullanıcı adı..."
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
            />
            <button className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm transition-colors">
              Arkadaş Ekle
            </button>
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-6 text-center">
            <MessageCircle size={48} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-sm">
              {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz direkt mesajınız yok'}
            </p>
            {!searchQuery && (
              <p className="text-gray-500 text-xs mt-2">
                Arkadaş ekleyerek sohbet başlatın
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredConversations.map((conversation) => (
              <div
                key={conversation.contactId}
                className={`p-3 rounded-lg cursor-pointer transition-colors group ${selectedContactId === conversation.contactId
                  ? 'bg-blue-600/20 border border-blue-600/30'
                  : 'hover:bg-gray-800'
                  }`}
                onClick={() => onConversationSelect(conversation.contactId, conversation.contactName)}
              >
                <div className="flex items-center space-x-3">
                  {/* Avatar */}
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {conversation.contactName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {/* Online/Idle indicator */}
                    {isUserOnline(conversation.contactId) && (
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${['away', 'idle'].includes(getUserStatus(conversation.contactId)) ? 'bg-blue-500' : 'bg-green-500'} border-2 border-gray-900 rounded-full`}></div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium text-sm truncate">
                        {conversation.contactName}
                      </h3>
                      {conversation.lastMessage && (
                        <span className="text-xs text-gray-400">
                          {formatMessageTime(conversation.lastMessage.created_at)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className="text-gray-400 text-xs truncate">
                        {conversation.lastMessage
                          ? conversation.lastMessage.is_image
                            ? '📷 Fotoğraf'
                            : truncateMessage(conversation.lastMessage.message)
                          : 'Mesaj yok'
                        }
                      </p>

                      {/* Unread badge */}
                      {conversation.unreadCount > 0 && (
                        <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full min-w-[20px] text-center">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartCall(conversation.contactId, conversation.contactName, 'voice');
                      }}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <Phone size={14} className="text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartCall(conversation.contactId, conversation.contactName, 'video');
                      }}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <Video size={14} className="text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};