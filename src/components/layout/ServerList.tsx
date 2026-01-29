import { useState, useEffect } from 'react';
import { Plus, Home, Settings, Users, Search, Download, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Server } from '@/lib/types';

import { ServerContextMenu } from '@/components/server/ServerContextMenu';
import { useNoiseSuppression } from '@/contexts/NoiseSuppressionContext';
import { toast } from 'sonner';
import { NotificationSystem } from '@/components/notifications/NotificationSystem';

const MUTED_SERVERS_KEY = 'muted_servers';

interface ServerListProps {
  selectedServerId: string | null;
  currentView: 'servers' | 'friends';
  onSelectServer: (serverId: string | null) => void;
  onViewChange: (view: 'servers' | 'friends') => void;
  onAddAction: () => void; // Context-aware add action
  onSettings: () => void;
  onSearch: () => void; // Global search action
  onNotificationNavigate?: (type: 'channel' | 'dm', id: string, serverId?: string) => void;
}

export function ServerList({
  selectedServerId,
  currentView,
  onSelectServer,
  onViewChange,
  onAddAction,
  onSettings,
  onSearch,
  onNotificationNavigate
}: ServerListProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const { user } = useAuth();
  const { isEnabled: isNoiseSuppressionEnabled, toggleNoiseSuppression } = useNoiseSuppression();

  const [isElectron, setIsElectron] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    server: Server;
  } | null>(null);

  // Muted servers state (stored in localStorage)
  const [mutedServers, setMutedServers] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(MUTED_SERVERS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Save muted servers to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(MUTED_SERVERS_KEY, JSON.stringify([...mutedServers]));
    } catch {
      // Ignore localStorage errors
    }
  }, [mutedServers]);

  // Check if running in Electron
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!(window as any).electron);
  }, []);
  useEffect(() => {
    if (!user) return;

    loadServers();

    // Subscribe to server changes (server details updates)
    const serverSubscription = supabase
      .channel('server_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => {
        loadServers();
      })
      .subscribe();

    // Subscribe to server_users changes (join/leave events)
    const membershipSubscription = supabase
      .channel('server_membership_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_users', filter: `user_id=eq.${user.id}` }, () => {
        loadServers();
      })
      .subscribe();

    return () => {
      serverSubscription.unsubscribe();
      membershipSubscription.unsubscribe();
    };
  }, [user?.id]);

  async function loadServers() {
    if (!user) return;

    // Get servers where user is a member
    const { data: serverUsers } = await supabase
      .from('server_users')
      .select('server_id')
      .eq('user_id', user.id);

    if (serverUsers && serverUsers.length > 0) {
      const serverIds = serverUsers.map(su => su.server_id);
      const { data: serversData } = await supabase
        .from('servers')
        .select('*')
        .in('id', serverIds)
        .order('created_at', { ascending: true });

      if (serversData) {
        setServers(serversData);
      }
    }
  }

  // Context menu handlers
  function handleContextMenu(e: React.MouseEvent, server: Server) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      server
    });
  }

  function handleToggleNotifications(serverId: string) {
    setMutedServers(prev => {
      const updated = new Set(prev);
      if (updated.has(serverId)) {
        updated.delete(serverId);
        toast.success('Bu sunucudan bildirimler açıldı');
      } else {
        updated.add(serverId);
        toast.success('Bu sunucudan bildirimler kapatıldı');
      }
      return updated;
    });
  }

  async function handleLeaveServer(server: Server) {
    if (!user) return;

    // Owner cannot leave their own server
    if (server.owner_id === user.id) {
      toast.error('Sunucu sahibi olarak ayrılamazsınız. Önce sunucuyu başka birine devredin veya silin.');
      return;
    }

    try {
      const { error } = await supabase
        .from('server_users')
        .delete()
        .eq('server_id', server.id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Remove from local state
      setServers(prev => prev.filter(s => s.id !== server.id));

      // If currently viewing this server, go to friends view
      if (selectedServerId === server.id) {
        onSelectServer(null);
        onViewChange('friends');
      }

      toast.success(`${server.name} sunucusundan ayrıldınız`);
    } catch (error) {
      console.error('Leave server error:', error);
      toast.error('Sunucudan ayrılırken bir hata oluştu');
    }
  }

  // Expose muted servers check for other components (via window for now)
  useEffect(() => {
    (window as any).isServerMuted = (serverId: string) => mutedServers.has(serverId);
  }, [mutedServers]);

  return (
    <div className="w-20 bg-gray-900 flex flex-col items-center py-3 gap-2 border-r border-gray-800">
      {/* Friends Button */}
      {/* Home / Friends Button (Ovox Logo) */}
      <button
        onClick={() => onViewChange('friends')}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-normal hover:rounded-lg overflow-hidden hover:shadow-glow ${currentView === 'friends'
          ? 'bg-primary-500 rounded-lg shadow-glow-sm'
          : 'bg-gray-800 hover:bg-gray-700'
          }`}
        title="Ana Sayfa"
      >
        <Users className="w-7 h-7 text-white" />
      </button>

      {/* Notifications Button */}
      <NotificationSystem onNavigate={onNotificationNavigate} />

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Scrollable Server List Container */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col items-center gap-2 py-1">
        {/* Server Icons */}
        {servers.map((server) => (
          <button
            key={server.id}
            onClick={() => onSelectServer(server.id)}
            onContextMenu={(e) => handleContextMenu(e, server)}
            className={`w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-normal hover:rounded-lg overflow-hidden ${selectedServerId === server.id && currentView === 'servers'
              ? 'bg-primary-500 rounded-lg shadow-glow-sm'
              : 'bg-gray-800 hover:bg-gray-700'
              } ${mutedServers.has(server.id) ? 'opacity-60' : ''}`}
            title={`${server.name}${mutedServers.has(server.id) ? ' (Bildirimler Kapalı)' : ''}`}
          >
            {server.server_image_url ? (
              <img
                src={server.server_image_url}
                alt={server.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-white">
                {server.name.charAt(0).toUpperCase()}
              </span>
            )}
          </button>
        ))}

        {/* Add Button - Global Server Creation */}
        <button
          onClick={onAddAction}
          className="w-14 h-14 rounded-full flex-shrink-0 border-2 border-dashed border-neutral-400 flex items-center justify-center transition-all duration-normal hover:border-primary-500 hover:text-primary-500 hover:shadow-glow-sm"
          title="Sunucu Ekle"
        >
          <Plus className="w-6 h-6 text-neutral-400 hover:text-primary-500" />
        </button>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
          display: none;
        }
        .custom-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
      `}</style>





      {/* Noise Suppression Toggle */}
      <button
        onClick={() => {
          toggleNoiseSuppression();
          toast.info(`Gürültü Engelleme: ${!isNoiseSuppressionEnabled ? 'Açık' : 'Kapalı'}`);
        }}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-normal hover:shadow-glow-sm group ${isNoiseSuppressionEnabled
          ? 'bg-indigo-600 text-white shadow-glow'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        title={`Gürültü Engelleme (${isNoiseSuppressionEnabled ? 'Açık' : 'Kapalı'})`}
      >
        <Sparkles className={`w-5 h-5 ${isNoiseSuppressionEnabled ? 'text-white animate-pulse' : 'group-hover:text-indigo-400'}`} />
      </button>

      {/* Search Button */}
      <button
        onClick={onSearch}
        className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center transition-all duration-normal hover:bg-primary-500 hover:shadow-glow-sm group"
        title="Arama"
      >
        <Search className="w-5 h-5 text-gray-400 group-hover:text-white" />
      </button>

      {/* Download Desktop App Button - Only visible in web version */}
      {!isElectron && (
        <a
          href="https://github.com/ytbx/skyperchatwithsupabase/releases/download/v0.3.10/Ovox-Setup-0.3.10.exe"
          download="Ovox-Setup-0.3.10.exe"
          className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center transition-gpu duration-normal hover:bg-green-500 hover:shadow-glow-sm group"
          title="Masaüstü Uygulamasını İndir"
        >
          <Download className="w-5 h-5 text-gray-400 group-hover:text-white" />
        </a>
      )}

      {/* Settings Button */}
      <button
        onClick={onSettings}
        className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center transition-all duration-normal hover:bg-gray-700 hover:shadow-glow-sm group"
        title="Ayarlar"
      >
        <Settings className="w-5 h-5 text-gray-400 group-hover:text-white" />
      </button>



      {/* Server Context Menu */}
      {contextMenu && (
        <ServerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          server={contextMenu.server}
          isNotificationsMuted={mutedServers.has(contextMenu.server.id)}
          onClose={() => setContextMenu(null)}
          onToggleNotifications={handleToggleNotifications}
          onLeaveServer={handleLeaveServer}
        />
      )}
    </div>
  );
}
