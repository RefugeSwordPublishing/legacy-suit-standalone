import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { canViewAllProjects } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Trash2, Users, MessageSquare, FolderKanban, Archive, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const MANAGEMENT_ROLES = ['owner', 'coo', 'admin', 'site_manager'];
const CAN_DELETE_ROLES = ['owner', 'coo', 'admin', 'site_manager'];
const MANAGEMENT_CHANNEL_ROLES = ['owner', 'coo', 'admin', 'site_manager'];

export default function TeamChat() {
  const { currentUser } = useCurrentUser();
  const [activeChannel, setActiveChannel] = useState('team');
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [unreadChannels, setUnreadChannels] = useState({});
  const bottomRef = useRef(null);

  // Track last-seen timestamps per channel in localStorage
  const getLastSeen = (channelId) => {
    const key = `chat_last_seen_${currentUser?.id}_${channelId}`;
    return parseInt(localStorage.getItem(key) || '0', 10);
  };

  const markChannelSeen = (channelId) => {
    const key = `chat_last_seen_${currentUser?.id}_${channelId}`;
    localStorage.setItem(key, Date.now().toString());
    setUnreadChannels(prev => ({ ...prev, [channelId]: false }));
  };

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const isSiteManager = currentUser?.role === 'site_manager';
  const isCrewMember = currentUser?.role === 'crew_member';

  // Site managers and crew members see all active project channels
  const visibleProjects = (canViewAllProjects(currentUser) || isSiteManager || isCrewMember)
    ? projects
    : projects.filter(p => (currentUser?.assigned_project_ids || []).includes(p.id));

  const activeProjects = visibleProjects.filter(p => p.status !== 'completed');
  const completedProjects = visibleProjects.filter(p => p.status === 'completed');

  const canSeeManagement = MANAGEMENT_CHANNEL_ROLES.includes(currentUser?.role) && !isCrewMember;
  const canDelete = CAN_DELETE_ROLES.includes(currentUser?.role);

  const channels = [
    { id: 'team', label: 'Full Team', icon: Users, group: 'General' },
    ...(canSeeManagement ? [{ id: 'management', label: 'Management', icon: MessageSquare, group: 'General' }] : []),
    ...activeProjects.map(p => ({ id: `project_${p.id}`, label: p.name, icon: FolderKanban, group: 'Projects' })),
    ...completedProjects.map(p => ({ id: `project_${p.id}`, label: p.name, icon: Archive, group: 'Archived Projects' })),
  ];

  // On mount, check for unread messages across all channels
  useEffect(() => {
    if (!currentUser?.id || channels.length === 0) return;
    const checkUnread = async () => {
      const results = {};
      await Promise.all(channels.map(async (ch) => {
        const lastSeen = getLastSeen(ch.id);
        const msgs = await base44.entities.ChatMessage.filter({ channel: ch.id }, '-created_date', 5);
        const hasUnread = msgs.some(m =>
          m.sender_id !== currentUser.id &&
          new Date(m.created_date).getTime() > lastSeen
        );
        results[ch.id] = hasUnread;
      }));
      setUnreadChannels(results);
    };
    checkUnread();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, channels.length]);

  const activeChannelObj = channels.find(c => c.id === activeChannel) || channels[0];

  const fetchMessages = async (channel) => {
    if (!channel) return;
    const items = await base44.entities.ChatMessage.filter(
      { channel },
      'created_date',
      100
    );
    setMessages(items);
  };

  useEffect(() => {
    fetchMessages(activeChannel);
    markChannelSeen(activeChannel);
    const unsub = base44.entities.ChatMessage.subscribe((event) => {
      if (event.type === 'delete') {
        setMessages(prev => prev.filter(m => m.id !== event.id));
      } else if (event.type === 'create') {
        if (event.data?.channel === activeChannel) {
          setMessages(prev => prev.some(m => m.id === event.data.id) ? prev : [...prev, event.data]);
          markChannelSeen(activeChannel);
        } else if (event.data?.channel && event.data?.sender_id !== currentUser?.id) {
          // New message in another channel, mark it unread
          setUnreadChannels(prev => ({ ...prev, [event.data.channel]: true }));
        } else if (!event.data) {
          fetchMessages(activeChannel);
        }
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !currentUser) return;
    setSending(true);
    const senderName = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.email;
    const msgText = newMsg.trim();
    setNewMsg('');
    const created = await base44.entities.ChatMessage.create({
      channel: activeChannel,
      sender_id: currentUser.id,
      sender_name: senderName,
      sender_role: currentUser.role,
      message: msgText,
    });
    // Optimistically add the message if subscription didn't already catch it
    setMessages(prev => prev.some(m => m.id === created.id) ? prev : [...prev, created]);
    setSending(false);
  };

  const deleteMessage = async (msgId) => {
    setDeletingId(msgId);
    await base44.entities.ChatMessage.delete(msgId);
    setDeletingId(null);
  };

  // Group channels by group label for the select
  const groupedChannels = channels.reduce((acc, ch) => {
    if (!acc[ch.group]) acc[ch.group] = [];
    acc[ch.group].push(ch);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            No messages yet. Start the conversation!
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUser?.id;
          return (
            <div key={msg.id} className={cn('flex gap-2 group', isMe && 'flex-row-reverse')}>
              <div className={cn(
                'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm relative',
                isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}>
                {!isMe && (
                  <p className="text-xs font-semibold mb-1 opacity-70">{msg.sender_name}</p>
                )}
                <p className="leading-relaxed">{msg.message}</p>
                <p className={cn('text-xs mt-1 opacity-50', isMe ? 'text-right' : '')}>
                  {format(new Date(msg.created_date), 'h:mm a')}
                </p>
              </div>
              {canDelete && (
                <button
                  onClick={() => deleteMessage(msg.id)}
                  disabled={deletingId === msg.id}
                  className="opacity-0 group-hover:opacity-100 self-center text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Channel selector + Input */}
      <div className="p-4 border-t bg-background space-y-2">
        <div className="flex items-center gap-2">
          <Select value={activeChannel} onValueChange={(ch) => { setActiveChannel(ch); markChannelSeen(ch); }}>
            <SelectTrigger className="w-56">
              <SelectValue>
                <span className="flex items-center gap-2">
                  {activeChannelObj && <activeChannelObj.icon className="w-4 h-4" />}
                  {activeChannelObj?.label}
                  {Object.values(unreadChannels).some(Boolean) && (
                    <Bell className="w-3 h-3 text-accent" />
                  )}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent side="top">
              {Object.entries(groupedChannels).map(([group, chs]) => (
                <div key={group}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group}
                  </div>
                  {chs.map(ch => (
                    <SelectItem key={ch.id} value={ch.id}>
                      <span className="flex items-center gap-2">
                        <ch.icon className="w-3.5 h-3.5" />
                        {ch.label}
                        {unreadChannels[ch.id] && (
                          <Bell className="w-3 h-3 text-accent ml-auto" />
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          {activeChannelObj?.group === 'Archived Projects' && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full flex items-center gap-1">
              <Archive className="w-3 h-3" /> Archived
            </span>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={e => { e.preventDefault(); sendMessage(); }}
        >
          <Input
            placeholder={`Message #${activeChannelObj?.label || ''}...`}
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={sending || !newMsg.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}