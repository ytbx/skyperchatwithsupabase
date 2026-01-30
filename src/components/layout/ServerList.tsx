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

// Types for sidebar organization
type SidebarItem = {
  id: string; // unique ID for folders, serverId for single servers
  type: 'server' | 'folder';
  serverId?: string; // only for type 'server'
  name?: string; // only for type 'folder'
  serverIds?: string[]; // only for type 'folder'
};

import { ServerFolderPopup } from '@/components/server/ServerFolderPopup';

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
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ index: number; item: SidebarItem } | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'inside' | 'after' | null>(null);
  const [folderPopup, setFolderPopup] = useState<{ x: number; y: number; folder: SidebarItem } | null>(null);

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

  // Sync sidebarItems with servers from DB
  useEffect(() => {
    if (!user) return;

    const saved = localStorage.getItem(`sidebar_v2_${user.id}`);
    let items: SidebarItem[] = saved ? JSON.parse(saved) : [];

    // Map of existing servers for quick lookup
    const serverMap = new Map(servers.map(s => [s.id, s]));

    // 1. Reconcile existing items: remove servers user is no longer a member of
    items = items.map(item => {
      if (item.type === 'server') {
        return serverMap.has(item.serverId!) ? item : null;
      } else {
        // Folder: Filter out servers user is no longer a member of
        const validServerIds = item.serverIds!.filter(id => serverMap.has(id));
        if (validServerIds.length === 0) return null; // Remove empty folders
        if (validServerIds.length === 1) {
          // Flatten single-server folder
          return { id: validServerIds[0], type: 'server' as const, serverId: validServerIds[0] };
        }
        return { ...item, serverIds: validServerIds };
      }
    }).filter(Boolean) as SidebarItem[];

    // 2. Add new servers that aren't in any folder or item yet
    const processedServerIds = new Set<string>();
    items.forEach(item => {
      if (item.type === 'server') processedServerIds.add(item.serverId!);
      else item.serverIds!.forEach(id => processedServerIds.add(id));
    });

    servers.forEach(server => {
      if (!processedServerIds.has(server.id)) {
        items.push({ id: server.id, type: 'server', serverId: server.id });
      }
    });

    setSidebarItems(items);
    localStorage.setItem(`sidebar_v2_${user.id}`, JSON.stringify(items));
  }, [servers, user?.id]);

  // Persistent save
  const saveSidebar = (newItems: SidebarItem[]) => {
    setSidebarItems(newItems);
    if (user) {
      localStorage.setItem(`sidebar_v2_${user.id}`, JSON.stringify(newItems));
    }
  };

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

    try {
      // Get servers where user is a member
      const { data: serverUsers, error: userError } = await supabase
        .from('server_users')
        .select('server_id')
        .eq('user_id', user.id);

      if (userError) throw userError;

      if (!serverUsers || serverUsers.length === 0) {
        setServers([]);
        // If we were viewing a server, go back to friends
        if (currentView === 'servers') {
          onSelectServer(null);
          onViewChange('friends');
        }
        return;
      }

      const serverIds = serverUsers.map(su => su.server_id);
      const { data: serversData, error: serversError } = await supabase
        .from('servers')
        .select('*')
        .in('id', serverIds)
        .order('created_at', { ascending: true });

      if (serversError) throw serversError;

      if (serversData) {
        setServers(serversData);

        // Check if currently selected server still exists in our membership
        if (selectedServerId && currentView === 'servers' && !serverIds.includes(selectedServerId)) {
          console.log('[ServerList] Current server no longer in membership, navigating away');
          onSelectServer(null);
          onViewChange('friends');
        }
      }
    } catch (err) {
      console.error('[ServerList] Error loading servers:', err);
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

    console.log('[ServerList] Attempting to leave server:', server.name, server.id);

    // Owner cannot leave their own server
    if (server.owner_id === user.id) {
      toast.error('Sunucu sahibi olarak ayrılamazsınız. Önce sunucuyu başka birine devredin veya ayarlar kısmından sunucuyu silin.');
      return;
    }

    // Capture states for rollback
    const previousServers = [...servers];
    const previousSidebarItems = [...sidebarItems];

    // Optimistic UI Update: Remove from both servers and sidebarItems immediately
    setServers(prev => prev.filter(s => s.id !== server.id));

    // Update sidebar items: remove server or extract from folder
    setSidebarItems(prev => {
      const updated = prev.map(item => {
        if (item.type === 'server') {
          return item.serverId === server.id ? null : item;
        } else {
          const filteredIds = item.serverIds?.filter(id => id !== server.id) || [];
          if (filteredIds.length === 0) return null;
          if (filteredIds.length === 1) {
            return { id: filteredIds[0], type: 'server' as const, serverId: filteredIds[0] };
          }
          return { ...item, serverIds: filteredIds };
        }
      }).filter(Boolean) as SidebarItem[];

      // Save revised sidebar to localStorage
      localStorage.setItem(`sidebar_v2_${user.id}`, JSON.stringify(updated));
      return updated;
    });

    const wasViewingServer = selectedServerId === server.id;
    if (wasViewingServer) {
      onSelectServer(null);
      onViewChange('friends');
    }

    try {
      console.log('[ServerList] Running database delete for server membership...');
      const { error, count } = await supabase
        .from('server_users')
        .delete({ count: 'exact' })
        .eq('server_id', server.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('[ServerList] Database error leaving server:', error);
        throw error;
      }

      if (count === 0) {
        console.warn('[ServerList] No membership record found to delete');
      }

      console.log('[ServerList] Successfully left server:', server.name);
      toast.success(`${server.name} sunucusundan ayrıldınız`);
      setContextMenu(null);
    } catch (error) {
      console.error('[ServerList] Error leaving server:', error);
      toast.error('Sunucudan ayrılırken bir hata oluştu');

      // Rollback optimistic update
      setServers(previousServers);
      setSidebarItems(previousSidebarItems);
      localStorage.setItem(`sidebar_v2_${user.id}`, JSON.stringify(previousSidebarItems));

      if (wasViewingServer) {
        onSelectServer(server.id);
        onViewChange('servers');
      }
    }
  }

  async function handleDeleteServer(server: Server) {
    if (!user || server.owner_id !== user.id) return;

    console.log('[ServerList] Attempting to delete server:', server.name, server.id);

    // Capture states for rollback
    const previousServers = [...servers];
    const previousSidebarItems = [...sidebarItems];

    // Optimistic UI Update
    setServers(prev => prev.filter(s => s.id !== server.id));
    setSidebarItems(prev => {
      const updated = prev.map(item => {
        if (item.type === 'server') {
          return item.serverId === server.id ? null : item;
        } else {
          const filteredIds = item.serverIds?.filter(id => id !== server.id) || [];
          if (filteredIds.length === 0) return null;
          if (filteredIds.length === 1) {
            return { id: filteredIds[0], type: 'server' as const, serverId: filteredIds[0] };
          }
          return { ...item, serverIds: filteredIds };
        }
      }).filter(Boolean) as SidebarItem[];
      localStorage.setItem(`sidebar_v2_${user.id}`, JSON.stringify(updated));
      return updated;
    });

    if (selectedServerId === server.id) {
      onSelectServer(null);
      onViewChange('friends');
    }

    try {
      const { error } = await supabase
        .from('servers')
        .delete()
        .eq('id', server.id);

      if (error) throw error;

      console.log('[ServerList] Successfully deleted server:', server.name);
      toast.success(`${server.name} sunucusu silindi`);
      setContextMenu(null);
    } catch (error) {
      console.error('[ServerList] Error deleting server:', error);
      toast.error('Sunucu silinirken bir hata oluştu');

      // Rollback
      setServers(previousServers);
      setSidebarItems(previousSidebarItems);
      localStorage.setItem(`sidebar_v2_${user.id}`, JSON.stringify(previousSidebarItems));

      if (selectedServerId === server.id) {
        onSelectServer(server.id);
        onViewChange('servers');
      }
    }
  }

  // Expose muted servers check for other components (via window for now)
  useEffect(() => {
    (window as any).isServerMuted = (serverId: string) => mutedServers.has(serverId);
  }, [mutedServers]);

  // Drag and Drop Handlers
  const onDragStart = (e: React.DragEvent, index: number, item: SidebarItem) => {
    setDraggedItem({ index, item });
    e.dataTransfer.effectAllowed = 'move';
    // Visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const onDragEnd = (e: React.DragEvent) => {
    setDraggedItem(null);
    setDraggedOverIndex(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null) return;

    // Check if dragging internal server or sidebar item
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const threshold = rect.height * 0.25;

    let position: 'before' | 'inside' | 'after' = 'inside';
    if (y < threshold) position = 'before';
    else if (y > rect.height - threshold) position = 'after';

    setDragOverPosition(position);
    setDraggedOverIndex(index);
  };

  const onDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    // Calculate final drop position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const threshold = rect.height * 0.25;
    let position: 'before' | 'inside' | 'after' = 'inside';
    if (y < threshold) position = 'before';
    else if (y > rect.height - threshold) position = 'after';

    // Reset feedback
    setDraggedItem(null);
    setDraggedOverIndex(null);
    setDragOverPosition(null);

    // Check if dragging from inside a folder
    const sourceServerIdInside = e.dataTransfer.getData('sourceServerId');
    const sourceFolderIdInside = e.dataTransfer.getData('sourceFolderId');

    if (sourceServerIdInside && sourceFolderIdInside) {
      const newItems = [...sidebarItems];
      const folderIdx = newItems.findIndex(i => i.id === sourceFolderIdInside);

      if (folderIdx !== -1) {
        // Remove from folder
        const folder = { ...newItems[folderIdx] };
        folder.serverIds = folder.serverIds!.filter(id => id !== sourceServerIdInside);

        // Remove folder if empty, or flatten if only 1 server left
        if (folder.serverIds.length === 0) {
          newItems.splice(folderIdx, 1);
        } else if (folder.serverIds.length === 1) {
          const remainingId = folder.serverIds[0];
          newItems.splice(folderIdx, 1, { id: remainingId, type: 'server', serverId: remainingId });
        } else {
          newItems[folderIdx] = folder;
        }

        // Add back to list
        const finalIndex = position === 'after' ? dropIndex + 1 : dropIndex;
        newItems.splice(finalIndex, 0, { id: sourceServerIdInside, type: 'server', serverId: sourceServerIdInside });
        saveSidebar(newItems);
        setFolderPopup(null);
      }
      return;
    }

    if (draggedItem === null) return;
    const sourceIndex = draggedItem.index;
    const sourceItem = sidebarItems[sourceIndex];

    if (sourceIndex === dropIndex && position === 'inside') return;

    const newItems = [...sidebarItems];
    const [movedItem] = newItems.splice(sourceIndex, 1);

    // Re-calculate drop index because list changed
    let adjustedDropIndex = dropIndex;
    if (sourceIndex < dropIndex) adjustedDropIndex--;

    if (position === 'inside') {
      const targetItem = newItems[adjustedDropIndex];
      // Merge into folder
      if (targetItem && targetItem.type === 'folder' && movedItem.type === 'server') {
        const folder = { ...targetItem };
        folder.serverIds = [...folder.serverIds!, movedItem.serverId!];
        newItems[adjustedDropIndex] = folder;
        saveSidebar(newItems);
        return;
      }
      // Create new folder
      if (targetItem && targetItem.type === 'server' && movedItem.type === 'server') {
        const newFolder: SidebarItem = {
          id: `folder_${Date.now()}`,
          type: 'folder',
          name: 'Yeni Grup',
          serverIds: [targetItem.serverId!, movedItem.serverId!]
        };
        newItems[adjustedDropIndex] = newFolder;
        saveSidebar(newItems);
        return;
      }
    }

    // Default Reordering: Insert at before or after
    let finalIndex = dropIndex;
    if (position === 'after') finalIndex++;

    // If we're dropping after an item we already removed, we need to adjust
    const reorderedItems = [...sidebarItems];
    const [itemToMove] = reorderedItems.splice(sourceIndex, 1);
    let targetIdx = dropIndex;
    if (position === 'after') targetIdx++;
    // Re-adjust target index because source was removed
    if (sourceIndex < targetIdx) targetIdx--;

    reorderedItems.splice(targetIdx, 0, itemToMove);
    saveSidebar(reorderedItems);
  };

  const renderServerIcon = (serverId: string, isSmall = false) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return null;

    return (
      <div
        className={`${isSmall ? 'w-5 h-5' : 'w-full h-full'} flex items-center justify-center overflow-hidden`}
      >
        {server.server_image_url ? (
          <img
            src={server.server_image_url}
            alt={server.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={`${isSmall ? 'text-[8px]' : 'text-lg'} font-bold text-white`}>
            {server.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="w-20 bg-gray-900 flex flex-col items-center py-3 gap-2 border-r border-gray-800">
      {/* Friends Button */}
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

      <NotificationSystem onNavigate={onNotificationNavigate} />

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Add Button */}
      <button
        onClick={onAddAction}
        className="w-14 h-14 rounded-full flex-shrink-0 border-2 border-dashed border-neutral-400 flex items-center justify-center transition-all duration-normal hover:border-primary-500 hover:text-primary-500 hover:shadow-glow-sm"
        title="Sunucu Ekle"
      >
        <Plus className="w-6 h-6 text-neutral-400 hover:text-primary-500" />
      </button>

      {/* Scrollable Server List Container */}
      <div
        className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col items-center gap-2 py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, sidebarItems.length)}
      >
        {sidebarItems.map((item, index) => {
          if (item.type === 'server') {
            const server = servers.find(s => s.id === item.serverId);
            if (!server) return null;

            return (
              <button
                key={item.id}
                draggable
                onDragStart={(e) => onDragStart(e, index, item)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => {
                  e.stopPropagation();
                  onDrop(e, index);
                }}
                onClick={() => {
                  onSelectServer(server.id);
                  onViewChange('servers');
                }}
                onContextMenu={(e) => handleContextMenu(e, server)}
                className={`w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-normal hover:rounded-lg overflow-hidden group relative ${selectedServerId === server.id && currentView === 'servers'
                  ? 'bg-primary-500 rounded-lg shadow-glow-sm'
                  : 'bg-gray-800 hover:bg-gray-700'
                  } ${mutedServers.has(server.id) ? 'opacity-60' : ''} ${draggedOverIndex === index && dragOverPosition === 'inside' ? 'ring-2 ring-blue-500 transition-all scale-110' : ''
                  }`}
                title={server.name}
              >
                {renderServerIcon(server.id)}

                {/* Drag Indicators */}
                {draggedOverIndex === index && dragOverPosition === 'before' && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 rounded-full z-10" />
                )}
                {draggedOverIndex === index && dragOverPosition === 'after' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-full z-10" />
                )}
              </button>
            );
          } else {
            // Folder Item
            return (
              <button
                key={item.id}
                draggable
                onDragStart={(e) => onDragStart(e, index, item)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => {
                  e.stopPropagation();
                  onDrop(e, index);
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setFolderPopup({
                    x: rect.right,
                    y: rect.top,
                    folder: item
                  });
                }}
                className={`w-14 h-14 rounded-2xl flex-shrink-0 bg-gray-800/50 hover:bg-gray-700 border border-gray-700/50 flex flex-wrap items-center justify-center p-1.5 gap-1 transition-all duration-200 group relative ${draggedOverIndex === index && dragOverPosition === 'inside' ? 'ring-2 ring-blue-500 scale-110' : ''
                  }`}
                title={item.name}
              >
                {item.serverIds!.slice(0, 4).map(id => (
                  <div key={id} className="w-5 h-5 rounded-sm bg-gray-900 overflow-hidden flex items-center justify-center">
                    {renderServerIcon(id, true)}
                  </div>
                ))}

                {/* Drag Indicators */}
                {draggedOverIndex === index && dragOverPosition === 'before' && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 rounded-full z-10" />
                )}
                {draggedOverIndex === index && dragOverPosition === 'after' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-full z-10" />
                )}
              </button>
            );
          }
        })}
      </div>

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Folder Popup */}
      {folderPopup && (
        <ServerFolderPopup
          x={folderPopup.x}
          y={folderPopup.y}
          folderId={folderPopup.folder.id}
          folderName={folderPopup.folder.name || 'Grup'}
          servers={servers.filter(s => folderPopup.folder.serverIds!.includes(s.id))}
          selectedServerId={selectedServerId}
          onSelectServer={(serverId) => {
            onSelectServer(serverId);
            onViewChange('servers');
          }}
          onClose={() => setFolderPopup(null)}
          onRename={(newName) => {
            const newItems = [...sidebarItems];
            const idx = newItems.findIndex(i => i.id === folderPopup.folder.id);
            if (idx !== -1) {
              newItems[idx] = { ...newItems[idx], name: newName };
              saveSidebar(newItems);
            }
          }}
          onContextMenu={handleContextMenu}
        />
      )}

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
          userId={user?.id || ''}
          server={contextMenu.server}
          isNotificationsMuted={mutedServers.has(contextMenu.server.id)}
          onClose={() => setContextMenu(null)}
          onToggleNotifications={handleToggleNotifications}
          onLeaveServer={handleLeaveServer}
          onDeleteServer={handleDeleteServer}
        />
      )}
    </div>
  );
}
