import { useState, useEffect } from 'react';
import { Plus, Home, Settings, Users, Search, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Server } from '@/lib/types';

interface ServerListProps {
  selectedServerId: string | null;
  currentView: 'servers' | 'friends';
  onSelectServer: (serverId: string | null) => void;
  onViewChange: (view: 'servers' | 'friends') => void;
  onAddAction: () => void; // Context-aware add action
  onSettings: () => void;
  onSearch: () => void; // Global search action
}

export function ServerList({
  selectedServerId,
  currentView,
  onSelectServer,
  onViewChange,
  onAddAction,
  onSettings,
  onSearch
}: ServerListProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const { user } = useAuth();
  const [isElectron, setIsElectron] = useState(false);

  // Check if running in Electron
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!(window as any).electron);
  }, []);

  useEffect(() => {
    if (!user) return;

    loadServers();

    // Subscribe to server changes
    const subscription = supabase
      .channel('server_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => {
        loadServers();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

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

  return (
    <div className="w-20 bg-gray-900 flex flex-col items-center py-3 gap-2 border-r border-gray-800">
      {/* Friends Button */}
      <button
        onClick={() => onViewChange('friends')}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-normal hover:rounded-lg hover:bg-primary-500 hover:shadow-glow ${currentView === 'friends'
          ? 'bg-primary-500 rounded-lg shadow-glow-sm'
          : 'bg-gray-800'
          }`}
        title="Arkadaşlar"
      >
        <Users className={`w-6 h-6 ${currentView === 'friends' ? 'text-white' : 'text-neutral-600'}`} />
      </button>

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Server Icons */}
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => onSelectServer(server.id)}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-normal hover:rounded-lg overflow-hidden ${selectedServerId === server.id && currentView === 'servers'
            ? 'bg-primary-500 rounded-lg shadow-glow-sm'
            : 'bg-gray-800 hover:bg-gray-700'
            }`}
          title={server.name}
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
        className="w-14 h-14 rounded-full border-2 border-dashed border-neutral-400 flex items-center justify-center transition-all duration-normal hover:border-primary-500 hover:text-primary-500 hover:shadow-glow-sm"
        title="Sunucu Ekle"
      >
        <Plus className="w-6 h-6 text-neutral-400 hover:text-primary-500" />
      </button>

      <div className="flex-1" />

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
          href="OvoxSetup.exe"
          download="OvoxSetup.exe"
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
    </div>
  );
}
