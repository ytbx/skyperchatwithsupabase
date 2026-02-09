import { useState, useEffect, useRef } from 'react';
import { Hash, Send, Paperclip, Smile, Plus, Gift, Image, Sticker, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseRealtime } from '@/contexts/SupabaseRealtimeContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { ChannelMessage, Channel, Profile, PERMISSIONS, ServerRole, ChannelPermission, Server } from '@/lib/types';
import { hasPermission, computeBasePermissions, computeChannelPermissions } from '@/utils/PermissionUtils';
import { FileUploadService } from '@/services/FileUploadService';
import { FilePreview } from '@/components/common/FilePreview';
import { AttachmentDisplay } from '@/components/common/AttachmentDisplay';
import { toast } from 'sonner';
import { GifPicker } from '@/components/chat/GifPicker';
import { MessageContent } from '@/components/chat/MessageContent';

interface MessageAreaProps {
  channelId: number | null;
}

interface GroupedMessage {
  sender: Profile | undefined;
  messages: ChannelMessage[];
}

export function MessageArea({ channelId }: MessageAreaProps) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [server, setServer] = useState<Server | null>(null);
  const [userRoles, setUserRoles] = useState<ServerRole[]>([]);
  const [currentChannelPermissions, setCurrentChannelPermissions] = useState<ChannelPermission[]>([]);
  const [profileCache] = useState<Record<string, Profile>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, profile } = useAuth();
  const { isUserOnline } = useSupabaseRealtime();
  const { setActiveChannel } = useNotifications();
  const prevMessagesLengthRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Bugün';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Dün';
    } else {
      return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  }

  // Group consecutive messages from the same sender
  function groupMessages(messages: ChannelMessage[]): GroupedMessage[] {
    const grouped: GroupedMessage[] = [];
    let currentGroup: GroupedMessage | null = null;

    messages.forEach((message) => {
      if (!currentGroup || currentGroup.sender?.id !== message.sender_id) {
        if (currentGroup) {
          grouped.push(currentGroup);
        }
        currentGroup = {
          sender: message.sender,
          messages: [message]
        };
      } else {
        // Check if messages are within 5 minutes
        const lastMessage = currentGroup.messages[currentGroup.messages.length - 1];
        const timeDiff = new Date(message.created_at).getTime() - new Date(lastMessage.created_at).getTime();

        if (timeDiff < 5 * 60 * 1000) { // 5 minutes
          currentGroup.messages.push(message);
        } else {
          grouped.push(currentGroup);
          currentGroup = {
            sender: message.sender,
            messages: [message]
          };
        }
      }
    });

    if (currentGroup) {
      grouped.push(currentGroup);
    }

    return grouped;
  }

  useEffect(() => {
    if (!channelId) {
      setChannel(null);
      setMessages([]);
      return;
    }

    loadChannelAndMessages();

    // Subscribe to new messages
    const subscription = supabase
      .channel(`messages_${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: number }).id;
            setMessages((prev) => prev.filter(m => m.id !== deletedId));
            return;
          }
          const newMessage = payload.new as ChannelMessage;
          // Load sender profile
          const { data: senderData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newMessage.sender_id)
            .maybeSingle();

          newMessage.sender = senderData || undefined;
          setMessages((prev) => [...prev, newMessage]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [channelId]);

  // Set active channel to prevent notifications for it
  useEffect(() => {
    if (channelId) {
      console.log('[MessageArea] Setting active channel to:', channelId);
      setActiveChannel(channelId);
    }

    return () => {
      console.log('[MessageArea] Clearing active channel');
      setActiveChannel(null);
    };
  }, [channelId, setActiveChannel]);

  const prevLastMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Only scroll to bottom if:
    // 1. It's the first load
    // 2. A new message was added to the BOTTOM AND user was already at bottom
    // 3. User themselves sent a new message to the BOTTOM

    const lastMessage = messages[messages.length - 1];
    const isNewMessageAtBottom = lastMessage && lastMessage.id !== prevLastMessageIdRef.current;
    const isSentByMe = lastMessage?.sender_id === user?.id;

    if (prevLastMessageIdRef.current === null || (isNewMessageAtBottom && (isAtBottomRef.current || isSentByMe))) {
      scrollToBottom();
      setShowScrollButton(false);
    } else if (isNewMessageAtBottom && !isAtBottomRef.current) {
      setShowScrollButton(true);
    }

    if (lastMessage) {
      prevLastMessageIdRef.current = lastMessage.id;
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, user?.id]);

  async function loadChannelAndMessages() {
    if (!channelId) return;

    // Load channel info (keep this part similar but maybe we can optimize later)
    const { data: channelData } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();

    if (channelData) {
      setChannel(channelData);

      // Load server
      const { data: serverData } = await supabase
        .from('servers')
        .select('*')
        .eq('id', channelData.server_id)
        .maybeSingle();
      if (serverData) setServer(serverData);

      // Load user roles
      const { data: userRolesData } = await supabase
        .from('server_user_roles')
        .select('role_id, server_roles(*)')
        .eq('user_id', user?.id)
        .eq('server_id', channelData.server_id);
      setUserRoles(userRolesData?.map((ur: any) => ur.server_roles) || []);

      // Load channel permissions
      const { data: permissionsData } = await supabase
        .from('channel_permissions')
        .select('*')
        .eq('channel_id', channelId);
      setCurrentChannelPermissions(permissionsData || []);
    }

    // Load initial messages (last 20)
    const { data: messagesData, error } = await supabase
      .from('channel_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    if (messagesData) {
      setHasMore(messagesData.length === 20);

      // Reverse to show in correct chronological order
      const reversedMessages = [...messagesData].reverse();

      // Load sender profiles (using cache)
      const senderIds = [...new Set(reversedMessages.map(m => m.sender_id))];
      const uncachedSenderIds = senderIds.filter(id => !profileCache[id]);

      if (uncachedSenderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', uncachedSenderIds);

        profiles?.forEach(p => {
          profileCache[p.id] = p;
        });
      }

      const messagesWithSenders = reversedMessages.map(msg => ({
        ...msg,
        sender: profileCache[msg.sender_id]
      }));

      setMessages(messagesWithSenders);
      // Wait for DOM to update then scroll to bottom
      setTimeout(scrollToBottom, 50);
    }
  }

  async function loadMoreMessages() {
    if (!channelId || !hasMore || isLoadingMore || messages.length === 0) return;

    setIsLoadingMore(true);
    const oldestMessage = messages[0];

    const { data: moreMessages, error } = await supabase
      .from('channel_messages')
      .select('*')
      .eq('channel_id', channelId)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading more messages:', error);
      setIsLoadingMore(false);
      return;
    }

    if (moreMessages) {
      setHasMore(moreMessages.length === 20);

      const reversedMore = [...moreMessages].reverse();

      // Load sender profiles for new messages (using cache)
      const senderIds = [...new Set(reversedMore.map(m => m.sender_id))];
      const uncachedSenderIds = senderIds.filter(id => !profileCache[id]);

      if (uncachedSenderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', uncachedSenderIds);

        profiles?.forEach(p => {
          profileCache[p.id] = p;
        });
      }

      const newMessagesWithSenders = reversedMore.map(msg => ({
        ...msg,
        sender: profileCache[msg.sender_id]
      }));

      // Maintain scroll position
      const container = messagesContainerRef.current;
      const oldScrollHeight = container?.scrollHeight || 0;

      setMessages(prev => [...newMessagesWithSenders, ...prev]);

      // Adjust scroll after state update
      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - oldScrollHeight;
        }
      }, 0);
    }
    setIsLoadingMore(false);
  }

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;

    // Check if user is near bottom (within 100px)
    const offset = 100;
    const currentIsAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + offset;
    isAtBottomRef.current = currentIsAtBottom;

    if (currentIsAtBottom) {
      setShowScrollButton(false);
    }

    if (target.scrollTop === 0 && hasMore && !isLoadingMore) {
      loadMoreMessages();
    }
  };

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!messageInput.trim() && !selectedFile) || !channelId || !user || sending) return;

    setSending(true);
    setIsUploading(true);

    try {
      let fileData = null;

      // Upload file if selected
      if (selectedFile) {
        const uploadResult = await FileUploadService.uploadMessageAttachment(selectedFile);
        fileData = uploadResult;
      }

      const { data: messageData, error } = await supabase
        .from('channel_messages')
        .insert({
          message: messageInput.trim() || (fileData ? fileData.name : ''),
          sender_id: user.id,
          channel_id: channelId,
          is_image: fileData ? FileUploadService.isImage(selectedFile!) : false,
          file_url: fileData?.url,
          file_name: fileData?.name,
          file_type: fileData?.type,
          file_size: fileData?.size,
        })
        .select()
        .single();

      if (error) throw error;

      // Process mentions for OFFLINE users (online users handle via subscription)
      const messageContent = messageInput.trim();
      if (messageContent && channel && messageData) {
        // Check for @everyone
        if (messageContent.includes('@everyone')) {
          // Get all server members except sender
          const { data: members } = await supabase
            .from('server_users')
            .select('user_id')
            .eq('server_id', channel.server_id)
            .neq('user_id', user.id);

          if (members && members.length > 0) {
            // Filter for OFFLINE users only
            const offlineMembers = members.filter(m => !isUserOnline(m.user_id));

            if (offlineMembers.length > 0) {
              const notifications = offlineMembers.map(member => ({
                user_id: member.user_id,
                type: 'message',
                title: `Everyone (${profile?.username || 'Birisi'})`,
                message: `${profile?.username || 'Birisi'}: ${messageContent}`,
                metadata: {
                  type: 'mention',
                  channelId: channelId,
                  messageId: messageData.id,
                  serverId: channel.server_id
                }
              }));

              await supabase.from('notifications').insert(notifications);
              console.log(`[MessageArea] Created notifications for ${offlineMembers.length} offline @everyone mentions`);
            }
          }
        }

        // Check for @username mentions
        const mentionRegex = /@(\w+)/g;
        const mentions = [...messageContent.matchAll(mentionRegex)];

        if (mentions.length > 0) {
          const usernames = mentions.map(m => m[1]);

          // Fetch users with these usernames
          const { data: mentionedUsers } = await supabase
            .from('profiles')
            .select('id, username')
            .in('username', usernames)
            .neq('id', user.id); // Don't notify self

          if (mentionedUsers && mentionedUsers.length > 0) {
            // Filter for OFFLINE users only
            const offlineMentioned = mentionedUsers.filter(u => !isUserOnline(u.id));

            if (offlineMentioned.length > 0) {
              const notifications = offlineMentioned.map(mentionedUser => ({
                user_id: mentionedUser.id,
                type: 'message',
                title: 'Sizden bahsedildi',
                message: `${profile?.username || 'Birisi'} sizden bahsetti: ${messageContent}`,
                metadata: {
                  type: 'mention',
                  channelId: channelId,
                  messageId: messageData.id,
                  serverId: channel.server_id
                }
              }));

              await supabase.from('notifications').insert(notifications);
              console.log(`[MessageArea] Created notifications for ${offlineMentioned.length} offline @username mentions`);
            }
          }
        }
      }

      setMessageInput('');
      setSelectedFile(null);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Send message error:', error);
      toast.error('Mesaj gönderilirken bir hata oluştu');
    } finally {
      setSending(false);
      setIsUploading(false);
      // Focus input after enabled again
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  }

  const sendGif = async (url: string) => {
    if (!channelId || !user) return;

    try {
      const messageData = {
        message: 'GIF',
        sender_id: user.id,
        channel_id: channelId,
        is_image: true,
        file_url: url,
        file_name: 'tenor.gif',
        file_type: 'image/gif',
        file_size: 0,
      };

      const { error } = await supabase
        .from('channel_messages')
        .insert(messageData);

      if (error) throw error;

      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    } catch (error) {
      console.error('Error sending GIF:', error);
      toast.error('GIF gönderilirken bir hata oluştu');
    }
  };

  async function deleteMessage(messageId: number) {
    try {
      const { error } = await supabase
        .from('channel_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      // Optimistic update
      setMessages((prev) => prev.filter(m => m.id !== messageId));
    } catch (error) {
      console.error('Delete message error:', error);
      toast.error('Mesaj silinirken bir hata oluştu');
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = FileUploadService.validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setSelectedFile(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const validation = FileUploadService.validateFile(file);
          if (!validation.valid) {
            toast.error(validation.error);
            return;
          }
          setSelectedFile(file);
          e.preventDefault();
          break;
        }
      }
    }
  }

  const basePermissions = computeBasePermissions(userRoles, server?.owner_id || '', user?.id || '');
  const channelPermsBitmask = computeChannelPermissions(
    basePermissions,
    userRoles,
    currentChannelPermissions,
    user?.id || '',
    server?.owner_id || ''
  );

  const canSendMessages = !channel?.is_readonly ||
    user?.id === server?.owner_id ||
    hasPermission(channelPermsBitmask, PERMISSIONS.ADMINISTRATOR) ||
    hasPermission(channelPermsBitmask, PERMISSIONS.MANAGE_CHANNELS) ||
    hasPermission(channelPermsBitmask, PERMISSIONS.SEND_MESSAGES);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as any);
    }
  }


  if (!channelId) {
    return (
      <div className="flex-1 bg-gray-800 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hash className="w-10 h-10 text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Bir Kanal Seçin
          </h3>
          <p className="text-gray-400 text-sm">
            Sohbete başlamak için sol panelden bir metin kanalı seçin
          </p>
        </div>
      </div>
    );
  }

  const groupedMessages = groupMessages(messages);

  return (
    <div className="flex-1 bg-gray-800 flex flex-col">
      {/* Channel Header - Modern Discord Style */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-gray-900/50 shadow-sm bg-gray-800">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-gray-400" />
          <h2 className="text-base font-semibold text-white">{channel?.name || 'kanal'}</h2>
          {channel?.name && (
            <div className="h-6 w-px bg-gray-600 mx-2" />
          )}
          <p className="text-sm text-gray-400">
            {channel?.name && `${channel.name} kanalı`}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar"
      >
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center animate-fade-in">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <Hash className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              #{channel?.name} kanalına hoş geldin!
            </h3>
            <p className="text-gray-400 text-sm text-center max-w-md">
              Bu kanal #{channel?.name} konuşmalarının başlangıcı. İlk mesajı göndererek konuşmayı başlat!
            </p>
          </div>
        ) : (
          <>
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex} className="message-group hover:bg-gray-900/20 transition-colors duration-150 rounded px-2 py-0.5 -mx-2">
                {/* First message with avatar and username */}
                <div className="flex gap-3 pt-1">
                  <div className="w-10 h-10 rounded-full bg-primary-500 flex-shrink-0 flex items-center justify-center overflow-hidden transition-transform duration-200 hover:scale-105">
                    {group.sender?.profile_image_url ? (
                      <img
                        src={group.sender.profile_image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-white">
                        {group.sender?.username?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white hover:underline cursor-pointer text-sm">
                        {group.sender?.username || 'Kullanıcı'}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        {formatTime(group.messages[0].created_at)}
                      </span>
                    </div>
                    {group.messages.map((message, msgIndex) => (
                      <div key={message.id} className={`${msgIndex > 0 ? 'mt-0.5' : ''} group relative pr-8`}>
                        <div className="text-gray-100 text-sm leading-relaxed break-words">
                          <MessageContent content={message.message} />
                        </div>
                        {message.file_url && (
                          <AttachmentDisplay
                            fileUrl={message.file_url}
                            fileName={message.file_name || 'file'}
                            fileType={message.file_type}
                            fileSize={message.file_size}
                          />
                        )}
                        {/* Delete button */}
                        {message.sender_id === user?.id && (
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="absolute top-0 right-0 p-1 bg-gray-700 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white text-gray-400"
                            title="Mesajı sil"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* New Message Notification Button */}
      {showScrollButton && (
        <div className="relative h-0">
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 transition-all duration-300 animate-fade-in">
            <button
              onClick={() => {
                scrollToBottom();
                setShowScrollButton(false);
              }}
              className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium transition-transform hover:scale-105 active:scale-95 border border-primary-400/30 backdrop-blur-md bg-opacity-90"
            >
              <Plus className="w-4 h-4 rotate-45 transform translate-y-0.5" />
              <span>Yeni mesajlar var - En aşağı git</span>
            </button>
          </div>
        </div>
      )}

      {/* Message Input - Modern Discord Style */}
      <div className="px-4 pb-6 pt-2">
        {/* File Preview */}
        {selectedFile && (
          <div className="mb-2">
            <FilePreview
              file={selectedFile}
              onRemove={() => setSelectedFile(null)}
            />
          </div>
        )}

        <form onSubmit={handleSendMessage} className="relative">
          <div className="bg-gray-700 rounded-lg shadow-lg transition-all duration-200 focus-within:bg-gray-650">
            <div className="flex items-center px-4 py-3">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.txt,.zip,.rar,.7z"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`text-gray-400 p-1 rounded transition-colors ${!canSendMessages ? 'cursor-not-allowed opacity-50' : 'hover:text-gray-300 hover:bg-gray-600'}`}
                title={canSendMessages ? "Dosya ekle" : "Mesaj gönderme yetkiniz yok"}
                disabled={isUploading || !canSendMessages}
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={canSendMessages ? `#${channel?.name || 'kanal'} kanalına mesaj gönder` : "Bu kanalda sadece yetkili kişiler mesaj gönderebilir"}
                className={`flex-1 mx-2 bg-transparent text-white placeholder:text-gray-500 focus:outline-none text-sm ${!canSendMessages ? 'cursor-not-allowed' : ''}`}
                disabled={sending || isUploading || !canSendMessages}
              />

              <div className="flex items-center gap-1">
                <GifPicker onGifSelect={canSendMessages ? sendGif : () => { }} />
              </div>
            </div>
          </div>
        </form>

        {/* Helper text */}
        <div className="mt-1 px-2">
          <p className="text-xs text-gray-500">
            <span className="font-semibold">Enter</span> ile gönder • <span className="font-semibold">Ctrl+V</span> ile resim yapıştır • Maks 1MB
          </p>
        </div>
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1f2937;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #374151;
        }
        .message-group:hover .message-actions {
          opacity: 1;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
