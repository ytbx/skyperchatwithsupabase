import { useState, useEffect, useRef } from 'react';
import { Hash, Send, Paperclip, Smile, Plus, Gift, Image, Sticker } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ChannelMessage, Channel, Profile } from '@/lib/types';

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
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

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
        { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` },
        async (payload) => {
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadChannelAndMessages() {
    if (!channelId) return;

    // Load channel
    const { data: channelData } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();

    if (channelData) {
      setChannel(channelData);
    }

    // Load messages
    const { data: messagesData } = await supabase
      .from('channel_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (messagesData) {
      // Load sender profiles
      const senderIds = [...new Set(messagesData.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', senderIds);

      const messagesWithSenders = messagesData.map(msg => ({
        ...msg,
        sender: profiles?.find(p => p.id === msg.sender_id)
      }));

      setMessages(messagesWithSenders);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageInput.trim() || !channelId || !user || sending) return;

    setSending(true);
    const { error } = await supabase
      .from('channel_messages')
      .insert({
        message: messageInput.trim(),
        sender_id: user.id,
        channel_id: channelId,
        is_image: false,
      });

    if (!error) {
      setMessageInput('');
      inputRef.current?.focus();
    }
    setSending(false);
  }

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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar">
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
                      <div key={message.id} className={msgIndex > 0 ? 'mt-0.5' : ''}>
                        <div className="text-gray-100 text-sm leading-relaxed break-words">
                          {message.message}
                        </div>
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

      {/* Message Input - Modern Discord Style */}
      <div className="px-4 pb-6 pt-2">
        <form onSubmit={handleSendMessage} className="relative">
          <div className="bg-gray-700 rounded-lg shadow-lg transition-all duration-200 focus-within:bg-gray-650">
            <div className="flex items-center px-4 py-3">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-600"
                title="Dosya ekle"
              >
                <Plus className="w-5 h-5" />
              </button>

              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`#${channel?.name || 'kanal'} kanalına mesaj gönder`}
                className="flex-1 mx-2 bg-transparent text-white placeholder:text-gray-500 focus:outline-none text-sm"
                disabled={sending}
              />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-600"
                  title="Emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Helper text */}
        <div className="mt-1 px-2">
          <p className="text-xs text-gray-500">
            <span className="font-semibold">Enter</span> ile gönder
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
