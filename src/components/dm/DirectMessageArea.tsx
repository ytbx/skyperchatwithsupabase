import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useCall } from '../../contexts/CallContext';
import { DirectMessage } from '../../lib/types';
import { Send, Paperclip, Smile, MoreVertical, Hash, User, Search, X, Clock, Hash as ChannelIcon, Users, Phone, Video, Trash2 } from 'lucide-react';
import { ActiveCallOverlay } from '../call/ActiveCallOverlay';
import { FileUploadService } from '@/services/FileUploadService';
import { FilePreview } from '@/components/common/FilePreview';
import { AttachmentDisplay } from '@/components/common/AttachmentDisplay';
import { toast } from 'sonner';

interface DirectMessageAreaProps {
  contactId: string;
  contactName: string;
  contactProfileImageUrl?: string | null;
}

export const DirectMessageArea: React.FC<DirectMessageAreaProps> = ({
  contactId,
  contactName,
  contactProfileImageUrl
}) => {
  const { user, profile } = useAuth();
  const { setActiveChat } = useNotifications();
  const { initiateCall, callStatus } = useCall();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search functionality states
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    messages: DirectMessage[];
    users: Array<{ id: string; username: string }>;
    channels: Array<{ id: number; name: string; server_name: string }>;
  }>({ messages: [], users: [], channels: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Set active chat when component mounts/changes
  useEffect(() => {
    if (contactId) {
      console.log('[DirectMessageArea] Setting active chat to:', contactId);
      setActiveChat(contactId);
    }

    // Clear active chat when component unmounts
    return () => {
      console.log('[DirectMessageArea] Clearing active chat');
      setActiveChat(null);
    };
  }, [contactId, setActiveChat]);

  useEffect(() => {
    if (contactId && user) {
      loadMessages();
      markMessagesAsRead();

      // Setup realtime subscription for both incoming and outgoing messages
      const subscription = supabase
        .channel(`dm_conversation_${contactId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chats'
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as { id: string }).id;
              setMessages(prev => prev.filter(m => m.id !== deletedId));
              return;
            }
            const newMessage = payload.new as DirectMessage;
            // Only add messages related to this conversation
            if (
              (newMessage.sender_id === user.id && newMessage.receiver_id === contactId) ||
              (newMessage.sender_id === contactId && newMessage.receiver_id === user.id)
            ) {
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(m => m.id === newMessage.id)) {
                  return prev;
                }
                return [...prev, newMessage];
              });
              if (newMessage.sender_id === contactId) {
                markMessagesAsRead();
              }
            }
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [contactId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Search functionality
  const handleSearch = (query: string) => {
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim()) {
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(query.trim());
      }, 300);
    } else {
      setSearchResults({ messages: [], users: [], channels: [] });
      setIsSearching(false);
      setSearchPerformed(false);
    }
  };

  const performSearch = async (query: string) => {
    try {
      setIsSearching(true);

      // Search in messages
      const { data: messageResults } = await supabase
        .from('chats')
        .select(`
          *,
          sender:profiles!chats_sender_id_fkey(username),
          receiver:profiles!chats_receiver_id_fkey(username)
        `)
        .or(`and(sender_id.eq.${user?.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${user?.id})`)
        .ilike('message', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(10);

      // Search in users (friends)
      const { data: userResults } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${query}%`)
        .neq('id', user?.id)
        .limit(10);

      // Search in channels (from servers user is member of)
      const { data: serverResults } = await supabase
        .from('servers')
        .select(`
          id, name,
          server_users!inner(user_id)
        `)
        .eq('server_users.user_id', user?.id);

      let channelResults: any[] = [];
      if (serverResults) {
        for (const server of serverResults) {
          const { data: channels } = await supabase
            .from('channels')
            .select('id, name')
            .eq('server_id', server.id)
            .ilike('name', `%${query}%`)
            .limit(5);

          if (channels) {
            channelResults.push(...channels.map(ch => ({
              ...ch,
              server_name: server.name
            })));
          }
        }
      }

      setSearchResults({
        messages: messageResults || [],
        users: userResults || [],
        channels: channelResults
      });

      setSearchPerformed(true);
      setIsSearching(false);
    } catch (error) {
      console.error('Search error:', error);
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults({ messages: [], users: [], channels: [] });
    setSearchPerformed(false);
    setShowSearch(false);
    setIsSearching(false);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSearch();
    }
  };

  // Handle click outside to close search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSearch && searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearch(false);
        clearSearch();
      }
    };

    if (showSearch) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSearch]);

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const loadMessages = async () => {
    if (!user || !contactId) return;

    try {
      setLoading(true);
      const { data: chats, error } = await supabase
        .from('chats')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      setMessages(chats || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markMessagesAsRead = async () => {
    if (!user || !contactId) return;

    await supabase
      .from('chats')
      .update({ is_read: true })
      .eq('sender_id', contactId)
      .eq('receiver_id', user.id)
      .eq('is_read', false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!user || !contactId || (!newMessage.trim() && !selectedFile)) return;

    try {
      setIsUploading(true);
      let fileData = null;

      // Upload file if selected
      if (selectedFile) {
        const uploadResult = await FileUploadService.uploadMessageAttachment(selectedFile);
        fileData = uploadResult;
      }

      const messageData = {
        message: newMessage.trim() || (fileData ? fileData.name : ''),
        sender_id: user.id,
        receiver_id: contactId,
        is_image: fileData ? FileUploadService.isImage(selectedFile!) : false,
        is_read: false,
        file_url: fileData?.url,
        file_name: fileData?.name,
        file_type: fileData?.type,
        file_size: fileData?.size,
      };

      const { data, error } = await supabase
        .from('chats')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;

      // Send notification to receiver (Sender-side generation)
      await supabase.from('notifications').insert({
        user_id: contactId,
        type: 'message',
        title: 'Yeni Direkt Mesaj',
        message: `${profile?.username || 'Birisi'}: ${newMessage.trim() || (fileData ? 'Dosya gönderdi' : 'Mesaj')}`,
        metadata: {
          type: 'dm',
          senderId: user.id,
          messageId: data.id
        }
      });

      setMessages(prev => [...prev, data]);
      setNewMessage('');
      setSelectedFile(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Mesaj gönderilirken bir hata oluştu');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      // Optimistic update
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Mesaj silinirken bir hata oluştu');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = FileUploadService.validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setSelectedFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
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
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInDays === 1) {
      return `Dün ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const groupMessages = (messages: DirectMessage[]) => {
    const groups: DirectMessage[][] = [];
    let currentGroup: DirectMessage[] = [];

    messages.forEach((message, index) => {
      if (index === 0 || message.sender_id !== messages[index - 1].sender_id) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  };

  if (!contactId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-800">
        <div className="text-center">
          <Hash size={64} className="text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            Direkt Mesaj Seç
          </h3>
          <p className="text-gray-400">
            Sol panelden bir konuşma seçin veya yeni bir sohbet başlatın
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-800">
      {/* Header - Hide when call is active or connecting */}
      {callStatus !== 'active' && callStatus !== 'connecting' && (
        <div className="h-16 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center overflow-hidden">
              {contactProfileImageUrl ? (
                <img
                  src={contactProfileImageUrl}
                  alt={contactName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={16} className="text-white" />
              )}
            </div>
            <div>
              <h3 className="text-white font-semibold">{contactName}</h3>
              <p className="text-xs text-gray-400">Direct Message</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Voice Call Button */}
            <button
              onClick={() => initiateCall(contactId, contactName, 'voice')}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Start voice call"
            >
              <Phone size={20} />
            </button>

            {/* Video Call Button */}
            <button
              onClick={() => initiateCall(contactId, contactName, 'video')}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Start video call"
            >
              <Video size={20} />
            </button>

            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 rounded-lg transition-colors ${showSearch ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
            >
              <Search size={20} />
            </button>
            <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
              <MoreVertical size={20} className="text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {/* Active Call Overlay */}
      {(callStatus === 'active' || callStatus === 'connecting') && (
        <ActiveCallOverlay />
      )}

      {/* Search Bar */}
      {showSearch && (
        <div className="bg-gray-800 border-b border-gray-700 p-4">
          <div className="relative" ref={searchContainerRef}>
            <div className="flex items-center bg-gray-700 rounded-lg px-4 py-3">
              <Search size={20} className="text-gray-400 mr-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleSearchKeyPress}
                placeholder="Mesajlarda, kullanıcılarda ve kanallarda ara..."
                className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="p-1 hover:bg-gray-600 rounded transition-colors ml-2"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              )}
            </div>

            {/* Search Results */}
            {showSearch && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                {isSearching && (
                  <div className="p-6 text-center">
                    <div className="flex items-center justify-center space-x-2 text-gray-400">
                      <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                      <span>Arıyorsunuz...</span>
                    </div>
                  </div>
                )}

                {searchQuery && searchPerformed && !isSearching && (
                  <div className="p-2">
                    {searchResults.messages.length === 0 &&
                      searchResults.users.length === 0 &&
                      searchResults.channels.length === 0 ? (
                      <div className="p-6 text-center">
                        <div className="flex items-center justify-center space-x-2 text-gray-400 mb-2">
                          <Search size={20} />
                          <span>Aranıyorsunuz...</span>
                        </div>
                        <p className="text-sm text-gray-500">
                          "{searchQuery}" için sonuç bulunamadı
                        </p>
                      </div>
                    ) : (
                      <div>
                        {/* Messages Section */}
                        {searchResults.messages.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">
                              Mesajlar
                            </h4>
                            {searchResults.messages.slice(0, 5).map((message, index) => (
                              <div key={message.id} className="px-3 py-2 hover:bg-gray-700 rounded cursor-pointer">
                                <div className="flex items-center space-x-2 text-sm">
                                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                    <span className="text-xs text-white">
                                      {message.sender_id === user?.id ? 'S' : contactName.charAt(0)}
                                    </span>
                                  </div>
                                  <span className="text-white">
                                    {message.sender_id === user?.id ? 'Siz' : contactName}:
                                  </span>
                                </div>
                                <p className="text-gray-300 text-sm mt-1 ml-8">
                                  {message.message.length > 100
                                    ? `${message.message.substring(0, 100)}...`
                                    : message.message}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 ml-8">
                                  {formatMessageTime(message.created_at)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Users Section */}
                        {searchResults.users.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">
                              Kullanıcılar
                            </h4>
                            {searchResults.users.slice(0, 5).map((user) => (
                              <div key={user.id} className="px-3 py-2 hover:bg-gray-700 rounded cursor-pointer flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-green-600 to-blue-600 rounded-full flex items-center justify-center">
                                  <User size={16} className="text-white" />
                                </div>
                                <span className="text-white">{user.username}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Channels Section */}
                        {searchResults.channels.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">
                              Kanallar
                            </h4>
                            {searchResults.channels.slice(0, 5).map((channel) => (
                              <div key={channel.id} className="px-3 py-2 hover:bg-gray-700 rounded cursor-pointer flex items-center space-x-3">
                                <ChannelIcon size={16} className="text-gray-400" />
                                <div>
                                  <span className="text-white">#{channel.name}</span>
                                  <p className="text-xs text-gray-400">{channel.server_name}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {searchQuery && !searchPerformed && !isSearching && (
                  <div className="p-6 text-center">
                    <div className="flex items-center justify-center space-x-2 text-gray-400">
                      <Clock size={20} />
                      <span>Aramaya hazırlanıyor...</span>
                    </div>
                  </div>
                )}

                {!searchQuery && !isSearching && (
                  <div className="p-6 text-center">
                    <div className="flex items-center justify-center space-x-2 text-gray-400 mb-2">
                      <Search size={20} />
                      <span>Aradınız!</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Mesajlarda, kullanıcılarda ve kanallarda arama yapın
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-gray-400">Mesajlar yükleniyor...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                <User size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {contactName} ile sohbet başlat
              </h3>
              <p className="text-gray-400 text-sm">
                Bu sizin ilk direkt mesaj konuşmanız
              </p>
            </div>
          </div>
        ) : (
          <>
            {groupMessages(messages).map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-1">
                {group.map((message, messageIndex) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-xs lg:max-w-md group relative ${message.sender_id === user?.id ? 'order-1' : 'order-2'
                      }`}>
                      {/* Show avatar only for first message in group from other user */}
                      {messageIndex === 0 && message.sender_id !== user?.id && (
                        <div className="flex items-center space-x-2 mb-1">
                          <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-xs text-white font-medium">
                              {contactName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{contactName}</span>
                        </div>
                      )}

                      <div className={`rounded-2xl px-4 py-2 ${message.sender_id === user?.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-white'
                        } ${messageIndex === 0 ? '' : 'mt-1'
                        }`}>
                        {message.is_image || message.file_url ? (
                          <div>
                            {message.file_url && (
                              <AttachmentDisplay
                                fileUrl={message.file_url}
                                fileName={message.file_name || 'file'}
                                fileType={message.file_type}
                                fileSize={message.file_size}
                              />
                            )}
                            {message.message && (
                              <div className="text-sm whitespace-pre-wrap break-words mt-2">
                                {message.message}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm whitespace-pre-wrap break-words">
                            {message.message}
                          </div>
                        )}

                        {/* Show time only on last message of group */}
                        {messageIndex === group.length - 1 && (
                          <div className={`text-xs mt-1 ${message.sender_id === user?.id ? 'text-blue-200' : 'text-gray-400'
                            }`}>
                            {formatMessageTime(message.created_at)}
                          </div>
                        )}
                        {/* Delete button */}
                        {message.sender_id === user?.id && (
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="absolute -top-2 -right-2 p-1 bg-gray-700 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white text-gray-400"
                            title="Mesajı sil"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-700">
        {/* File Preview */}
        {selectedFile && (
          <div className="mb-2">
            <FilePreview
              file={selectedFile}
              onRemove={() => setSelectedFile(null)}
            />
          </div>
        )}

        <div className="flex items-center space-x-3">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,.txt"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Paperclip size={20} className="text-gray-400" />
          </button>

          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              placeholder={`${contactName} ile mesajlaş...`}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              disabled={isUploading}
            />
          </div>

          <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
            <Smile size={20} className="text-gray-400" />
          </button>

          <button
            onClick={sendMessage}
            disabled={(!newMessage.trim() && !selectedFile) || isUploading}
            className={`p-2 rounded-lg transition-colors ${(newMessage.trim() || selectedFile) && !isUploading
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
          >
            <Send size={20} />
          </button>
        </div>

        {/* Helper text */}
        <div className="mt-2 px-2">
          <p className="text-xs text-gray-500">
            <span className="font-semibold">Enter</span> ile gönder • <span className="font-semibold">Ctrl+V</span> ile resim yapıştır • Maks 1MB
          </p>
        </div>
      </div>
    </div>
  );
};