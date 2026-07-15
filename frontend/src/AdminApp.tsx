import {
  CheckCircle2,
  Cloud,
  CreditCard,
  ClipboardList,
  EyeOff,
  FileVideo,
  Gauge,
  KeyRound,
  Loader2,
  PlaySquare,
  RefreshCw,
  Save,
  Shield,
  ShoppingBag,
  UploadCloud,
  Users,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from './api';

type FieldStatus = {
  value: string;
  hasValue: boolean;
  masked: string | null;
};

type AdminSettings = {
  telegramBotToken: FieldStatus;
  telegramPaymentsEnabled: FieldStatus;
  telegramPaymentProviderToken: FieldStatus;
  cloudflareAccountId: FieldStatus;
  cloudflareApiToken: FieldStatus;
  cloudflareStreamSigningKeyId: FieldStatus;
  cloudflareStreamSigningPrivateKey: FieldStatus;
  demoCloudflareVideoUid: FieldStatus;
  officialWatermarkText: FieldStatus;
  maxConcurrentPlaySessions: FieldStatus;
  mockPaymentsEnabled: FieldStatus;
};

type CloudflareVideo = {
  uid: string;
  name: string;
  state?: string;
  duration?: number;
  created?: string;
};

type LocalVideo = {
  id: number;
  title: string;
  description: string | null;
  cloudflareVideoUid: string;
  priceCents: number;
  currency: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  counts: {
    orders: number;
    entitlements: number;
    playSessions: number;
  };
};

type AdminOrder = {
  id: number;
  orderCode: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerPaymentId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  user: {
    telegramUserId: string;
    username: string | null;
    firstName?: string | null;
  };
  video: {
    id: number;
    title: string;
  };
  entitlement: {
    id: number;
    status: string;
  } | null;
};

type AdminOrderDetail = AdminOrder & {
  updatedAt: string;
  user: AdminOrder['user'] & {
    id: number;
    lastName?: string | null;
    languageCode?: string | null;
    createdAt: string;
  };
  video: AdminOrder['video'] & {
    cloudflareVideoUid: string;
    priceCents: number;
    currency: string;
    status: string;
  };
  entitlement: {
    id: number;
    status: string;
    startsAt?: string;
    createdAt?: string;
    expiresAt?: string | null;
    revokedAt?: string | null;
  } | null;
  playSessions: Array<{
    id: number;
    sessionCode: string;
    ipAddress: string | null;
    userAgent: string | null;
    tokenExpiresAt: string;
    createdAt: string;
    lastSeenAt: string | null;
    eventCount: number;
  }>;
};

type AdminUser = {
  id: number;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  createdAt: string;
  counts: {
    orders: number;
    entitlements: number;
    playSessions: number;
  };
};

type AdminUserDetail = AdminUser & {
  lastName: string | null;
  languageCode: string | null;
  orders: Array<{
    id: number;
    orderCode: string;
    status: string;
    provider: string;
    amountCents: number;
    currency: string;
    paidAt: string | null;
    createdAt: string;
    video: {
      id: number;
      title: string;
    };
    entitlement: {
      id: number;
      status: string;
    } | null;
  }>;
  entitlements: Array<{
    id: number;
    status: string;
    startsAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    video: {
      id: number;
      title: string;
    };
    order: {
      id: number;
      orderCode: string;
    };
  }>;
  playSessions: Array<{
    id: number;
    sessionCode: string;
    ipAddress: string | null;
    createdAt: string;
    lastSeenAt: string | null;
    eventCount: number;
    video: {
      id: number;
      title: string;
    };
    order: {
      id: number;
      orderCode: string;
    };
  }>;
};

type PlaySession = {
  id: number;
  sessionCode: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  eventCount: number;
  user: {
    telegramUserId: string;
    username: string | null;
  };
  video: {
    title: string;
  };
  order: {
    orderCode: string;
  };
};

type PlayEvent = {
  id: number;
  eventType: string;
  playbackPositionSeconds: number | null;
  createdAt: string;
};

type PlaySessionDetail = PlaySession & {
  tokenExpiresAt: string;
  events: PlayEvent[];
};

type ActivityLog = {
  id: number;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  message: string;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
};

type Overview = {
  stats: {
    userCount: number;
    videoCount: number;
    activeVideoCount: number;
    orderCount: number;
    paidOrderCount: number;
    activeEntitlementCount: number;
    playSessionCount: number;
  };
  recentOrders: AdminOrder[];
};

type TabKey =
  | 'overview'
  | 'settings'
  | 'payments'
  | 'videos'
  | 'cloudflare'
  | 'orders'
  | 'users'
  | 'sessions'
  | 'logs'
  | 'devtools';

const tabs: Array<{ key: TabKey; label: string; icon: typeof Gauge }> = [
  { key: 'overview', label: '概览', icon: Gauge },
  { key: 'settings', label: '配置', icon: KeyRound },
  { key: 'payments', label: '支付', icon: CreditCard },
  { key: 'videos', label: '视频', icon: FileVideo },
  { key: 'cloudflare', label: 'Cloudflare', icon: Cloud },
  { key: 'orders', label: '订单', icon: ShoppingBag },
  { key: 'users', label: '用户', icon: Users },
  { key: 'sessions', label: '播放', icon: PlaySquare },
  { key: 'logs', label: '日志', icon: ClipboardList },
  { key: 'devtools', label: '开发', icon: Wrench },
];

const emptySettingsForm = {
  telegramBotToken: '',
  telegramPaymentsEnabled: 'false',
  telegramPaymentProviderToken: '',
  cloudflareAccountId: '',
  cloudflareApiToken: '',
  cloudflareStreamSigningKeyId: '',
  cloudflareStreamSigningPrivateKey: '',
  demoCloudflareVideoUid: '',
  officialWatermarkText: 'Official',
  maxConcurrentPlaySessions: '1',
};

const emptyVideoForm = {
  title: '',
  description: '',
  cloudflareVideoUid: '',
  priceCents: '990',
  currency: 'USD',
  status: 'ACTIVE',
};

export function AdminApp() {
  const [adminPassword, setAdminPassword] = useState(
    sessionStorage.getItem('adminPassword') || '',
  );
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [settingsForm, setSettingsForm] = useState(emptySettingsForm);
  const [videoForm, setVideoForm] = useState(emptyVideoForm);
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [editVideoForm, setEditVideoForm] = useState(emptyVideoForm);
  const [grantForm, setGrantForm] = useState({
    telegramUserId: '',
    username: '',
    videoId: '',
  });
  const [filters, setFilters] = useState({
    videos: '',
    videoStatus: '',
    orders: '',
    orderStatus: '',
    orderProvider: '',
    users: '',
    sessions: '',
    logs: '',
  });
  const [devForm, setDevForm] = useState({
    telegramUserId: '20001',
    username: 'testbuyer',
    videoId: '',
    provider: 'manual',
    paid: 'false',
    orderCode: '',
  });
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [localVideos, setLocalVideos] = useState<LocalVideo[]>([]);
  const [cloudflareVideos, setCloudflareVideos] = useState<CloudflareVideo[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [selectedSession, setSelectedSession] = useState<PlaySessionDetail | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const isAuthed = Boolean(settings);

  const activeVideos = useMemo(
    () => localVideos.filter((video) => video.status === 'ACTIVE'),
    [localVideos],
  );

  useEffect(() => {
    if (adminPassword) {
      void loadAll(adminPassword);
    }
  }, []);

  function showError(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
  }

  function makeQuery(params: Record<string, string>) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value.trim()) {
        query.set(key, value.trim());
      }
    });

    const text = query.toString();
    return text ? `?${text}` : '';
  }

  async function loadAll(password = adminPassword) {
    setError(null);
    setBusy('load');

    try {
      const [settingsResponse, overviewResponse, videosResponse] =
        await Promise.all([
          adminFetch<{ settings: AdminSettings }>(
            '/api/admin/settings',
            password,
          ),
          adminFetch<Overview>('/api/admin/overview', password),
          adminFetch<{ videos: LocalVideo[] }>('/api/admin/videos', password),
        ]);

      setSettings(settingsResponse.settings);
      setOverview(overviewResponse);
      setLocalVideos(videosResponse.videos);
      setSettingsForm((current) => ({
        ...current,
        telegramPaymentsEnabled:
          settingsResponse.settings.telegramPaymentsEnabled.value || 'false',
        cloudflareAccountId:
          settingsResponse.settings.cloudflareAccountId.value,
        cloudflareStreamSigningKeyId:
          settingsResponse.settings.cloudflareStreamSigningKeyId.value,
        demoCloudflareVideoUid:
          settingsResponse.settings.demoCloudflareVideoUid.value,
        officialWatermarkText:
          settingsResponse.settings.officialWatermarkText.value || 'Official',
        maxConcurrentPlaySessions:
          settingsResponse.settings.maxConcurrentPlaySessions.value || '1',
      }));
      sessionStorage.setItem('adminPassword', password);
      setMessage('后台已载入');
    } catch (caught) {
      showError(caught, '后台载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function refreshTab(tab = activeTab) {
    if (!adminPassword) return;

    setError(null);
    setBusy(`refresh-${tab}`);

    try {
      if (tab === 'overview') {
        setOverview(await adminFetch<Overview>('/api/admin/overview', adminPassword));
      }

      if (tab === 'videos') {
        const response = await adminFetch<{ videos: LocalVideo[] }>(
          `/api/admin/videos${makeQuery({
            q: filters.videos,
            status: filters.videoStatus,
          })}`,
          adminPassword,
        );
        setLocalVideos(response.videos);
      }

      if (tab === 'orders') {
        const response = await adminFetch<{ orders: AdminOrder[] }>(
          `/api/admin/orders${makeQuery({
            q: filters.orders,
            status: filters.orderStatus,
            provider: filters.orderProvider,
          })}`,
          adminPassword,
        );
        setOrders(response.orders);
      }

      if (tab === 'users') {
        const response = await adminFetch<{ users: AdminUser[] }>(
          `/api/admin/users${makeQuery({ q: filters.users })}`,
          adminPassword,
        );
        setUsers(response.users);
      }

      if (tab === 'sessions') {
        const response = await adminFetch<{ sessions: PlaySession[] }>(
          `/api/admin/play-sessions${makeQuery({ q: filters.sessions })}`,
          adminPassword,
        );
        setSessions(response.sessions);
      }

      if (tab === 'logs') {
        const response = await adminFetch<{ logs: ActivityLog[] }>(
          `/api/admin/activity-logs${makeQuery({ q: filters.logs })}`,
          adminPassword,
        );
        setLogs(response.logs);
      }
    } catch (caught) {
      showError(caught, '刷新失败');
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    setError(null);
    setMessage(null);
    setBusy('save-settings');

    try {
      await adminFetch('/api/admin/settings', adminPassword, {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      });
      await loadAll();
      setSettingsForm((current) => ({
        ...current,
        telegramBotToken: '',
        telegramPaymentProviderToken: '',
        cloudflareApiToken: '',
        cloudflareStreamSigningPrivateKey: '',
      }));
      setMessage('配置已保存');
    } catch (caught) {
      showError(caught, '保存失败');
    } finally {
      setBusy(null);
    }
  }

  async function testTelegram() {
    setError(null);
    setMessage(null);
    setBusy('telegram');

    try {
      const response = await adminFetch<{ bot: { username?: string } }>(
        '/api/admin/test/telegram',
        adminPassword,
        { method: 'POST' },
      );
      setMessage(`Telegram Bot 连接成功：@${response.bot.username || 'unknown'}`);
    } catch (caught) {
      showError(caught, 'Telegram 测试失败');
    } finally {
      setBusy(null);
    }
  }

  async function testCloudflare() {
    setError(null);
    setMessage(null);
    setBusy('cloudflare');

    try {
      await adminFetch('/api/admin/test/cloudflare', adminPassword, {
        method: 'POST',
      });
      setMessage('Cloudflare Stream 连接成功');
    } catch (caught) {
      showError(caught, 'Cloudflare 测试失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadCloudflareVideos() {
    setError(null);
    setMessage(null);
    setBusy('cloudflare-videos');

    try {
      const response = await adminFetch<{ videos: CloudflareVideo[] }>(
        '/api/admin/cloudflare/videos',
        adminPassword,
      );
      setCloudflareVideos(response.videos);
      setMessage(`已载入 ${response.videos.length} 个 Cloudflare 视频`);
    } catch (caught) {
      showError(caught, 'Cloudflare 视频载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function importVideo(video: CloudflareVideo) {
    setError(null);
    setMessage(null);
    setBusy(video.uid);

    try {
      await adminFetch('/api/admin/videos/import', adminPassword, {
        method: 'POST',
        body: JSON.stringify({
          cloudflareVideoUid: video.uid,
          title: video.name,
          description: `Cloudflare Stream: ${video.uid}`,
          priceCents: 990,
          currency: 'USD',
        }),
      });
      await refreshTab('videos');
      setMessage(`已导入：${video.name}`);
    } catch (caught) {
      showError(caught, '导入失败');
    } finally {
      setBusy(null);
    }
  }

  async function saveVideo() {
    setError(null);
    setMessage(null);
    setBusy('save-video');

    try {
      await adminFetch('/api/admin/videos', adminPassword, {
        method: 'POST',
        body: JSON.stringify({
          ...videoForm,
          priceCents: Number(videoForm.priceCents),
        }),
      });
      setVideoForm(emptyVideoForm);
      await refreshTab('videos');
      setMessage('视频已创建');
    } catch (caught) {
      showError(caught, '视频创建失败');
    } finally {
      setBusy(null);
    }
  }

  async function updateVideo(video: LocalVideo, status?: LocalVideo['status']) {
    if (status === 'ARCHIVED' && !window.confirm(`确认归档视频「${video.title}」？`)) {
      return;
    }

    setError(null);
    setMessage(null);
    setBusy(`video-${video.id}`);

    try {
      await adminFetch(`/api/admin/videos/${video.id}`, adminPassword, {
        method: 'PUT',
        body: JSON.stringify({ status: status || video.status }),
      });
      await refreshTab('videos');
      setMessage('视频状态已更新');
    } catch (caught) {
      showError(caught, '视频更新失败');
    } finally {
      setBusy(null);
    }
  }

  function startEditVideo(video: LocalVideo) {
    setEditingVideoId(video.id);
    setEditVideoForm({
      title: video.title,
      description: video.description || '',
      cloudflareVideoUid: video.cloudflareVideoUid,
      priceCents: String(video.priceCents),
      currency: video.currency,
      status: video.status,
    });
  }

  async function saveVideoEdit(video: LocalVideo) {
    setError(null);
    setMessage(null);
    setBusy(`edit-video-${video.id}`);

    try {
      await adminFetch(`/api/admin/videos/${video.id}`, adminPassword, {
        method: 'PUT',
        body: JSON.stringify({
          ...editVideoForm,
          priceCents: Number(editVideoForm.priceCents),
        }),
      });
      setEditingVideoId(null);
      await refreshTab('videos');
      setMessage('视频已保存');
    } catch (caught) {
      showError(caught, '视频保存失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadOrderDetail(order: AdminOrder) {
    setError(null);
    setBusy(`order-${order.id}`);

    try {
      const response = await adminFetch<{ order: AdminOrderDetail }>(
        `/api/admin/orders/${order.id}`,
        adminPassword,
      );
      setSelectedOrder(response.order);
    } catch (caught) {
      showError(caught, '订单详情载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function grantOrder(order: AdminOrder) {
    if (!window.confirm(`确认标记订单 ${order.orderCode} 为已支付并发放权限？`)) {
      return;
    }

    setError(null);
    setBusy(`grant-${order.id}`);

    try {
      await adminFetch(`/api/admin/orders/${order.id}/grant`, adminPassword, {
        method: 'POST',
      });
      await refreshTab('orders');
      if (selectedOrder?.id === order.id) {
        await loadOrderDetail(order);
      }
      setMessage(`已发放权限：${order.orderCode}`);
    } catch (caught) {
      showError(caught, '发放权限失败');
    } finally {
      setBusy(null);
    }
  }

  async function changeEntitlement(id: number, action: 'revoke' | 'restore') {
    if (!window.confirm(action === 'revoke' ? '确认撤销这个权限？' : '确认恢复这个权限？')) {
      return;
    }

    setError(null);
    setBusy(`${action}-${id}`);

    try {
      await adminFetch(`/api/admin/entitlements/${id}/${action}`, adminPassword, {
        method: 'POST',
      });
      await refreshTab('orders');
      if (selectedOrder?.entitlement?.id === id) {
        await loadOrderDetail(selectedOrder);
      }
      setMessage(action === 'revoke' ? '权限已撤销' : '权限已恢复');
    } catch (caught) {
      showError(caught, '权限操作失败');
    } finally {
      setBusy(null);
    }
  }

  async function manualGrant() {
    if (!window.confirm('确认手动发放这个视频权限？')) {
      return;
    }

    setError(null);
    setBusy('manual-grant');

    try {
      await adminFetch('/api/admin/grants', adminPassword, {
        method: 'POST',
        body: JSON.stringify({
          telegramUserId: grantForm.telegramUserId,
          username: grantForm.username,
          videoId: grantForm.videoId,
        }),
      });
      setGrantForm({ telegramUserId: '', username: '', videoId: '' });
      await Promise.all([refreshTab('orders'), refreshTab('users')]);
      setMessage('手动权限已发放');
    } catch (caught) {
      showError(caught, '手动发放失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadUserDetail(user: AdminUser) {
    setError(null);
    setBusy(`user-${user.id}`);

    try {
      const response = await adminFetch<{ user: AdminUserDetail }>(
        `/api/admin/users/${user.id}`,
        adminPassword,
      );
      setSelectedUser(response.user);
    } catch (caught) {
      showError(caught, '用户详情载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadSessionDetail(session: PlaySession) {
    setError(null);
    setBusy(`session-${session.id}`);

    try {
      const response = await adminFetch<{ session: PlaySessionDetail }>(
        `/api/admin/play-sessions/${session.id}`,
        adminPassword,
      );
      setSelectedSession(response.session);
    } catch (caught) {
      showError(caught, '播放事件载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function createTestUser() {
    setError(null);
    setBusy('dev-user');

    try {
      const response = await adminFetch<{ user: AdminUser }>(
        '/api/admin/dev/test-user',
        adminPassword,
        {
          method: 'POST',
          body: JSON.stringify({
            telegramUserId: devForm.telegramUserId,
            username: devForm.username,
          }),
        },
      );
      setDevForm((current) => ({
        ...current,
        telegramUserId: response.user.telegramUserId,
      }));
      await refreshTab('users');
      setMessage(`测试用户已创建：${response.user.telegramUserId}`);
    } catch (caught) {
      showError(caught, '测试用户创建失败');
    } finally {
      setBusy(null);
    }
  }

  async function createTestOrder() {
    setError(null);
    setBusy('dev-order');

    try {
      const response = await adminFetch<{ order: { orderCode: string } }>(
        '/api/admin/dev/test-order',
        adminPassword,
        {
          method: 'POST',
          body: JSON.stringify({
            telegramUserId: devForm.telegramUserId,
            videoId: devForm.videoId,
            provider: devForm.provider,
            paid: devForm.paid === 'true',
          }),
        },
      );
      setDevForm((current) => ({
        ...current,
        orderCode: response.order.orderCode,
      }));
      await Promise.all([refreshTab('orders'), refreshTab('users')]);
      setMessage(`测试订单已创建：${response.order.orderCode}`);
    } catch (caught) {
      showError(caught, '测试订单创建失败');
    } finally {
      setBusy(null);
    }
  }

  async function simulateTelegramPayment() {
    if (!devForm.orderCode.trim()) {
      setError('请先填写订单号');
      return;
    }

    if (!window.confirm(`确认模拟 Telegram 支付回调：${devForm.orderCode}？`)) {
      return;
    }

    setError(null);
    setBusy('dev-telegram-payment');

    try {
      await adminFetch('/api/admin/dev/simulate-telegram-payment', adminPassword, {
        method: 'POST',
        body: JSON.stringify({
          orderCode: devForm.orderCode,
        }),
      });
      await Promise.all([refreshTab('orders'), refreshTab('logs')]);
      setMessage(`已模拟 Telegram 支付成功：${devForm.orderCode}`);
    } catch (caught) {
      showError(caught, '模拟 Telegram 支付失败');
    } finally {
      setBusy(null);
    }
  }

  async function clearPlaySessions() {
    if (!window.confirm('确认清理所有播放 session 和播放事件？')) {
      return;
    }

    setError(null);
    setBusy('dev-clear-sessions');

    try {
      const response = await adminFetch<{
        deletedEvents: number;
        deletedSessions: number;
      }>('/api/admin/dev/clear-play-sessions', adminPassword, {
        method: 'POST',
      });
      await refreshTab('sessions');
      setSelectedSession(null);
      setMessage(
        `已清理 ${response.deletedSessions} 个 session / ${response.deletedEvents} 个事件`,
      );
    } catch (caught) {
      showError(caught, '清理播放记录失败');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>运营后台</h1>
        </div>
        <a className="admin-link" href="/">
          返回前台
        </a>
      </header>

      <section className="admin-panel">
        <h2>管理员登录</h2>
        <div className="admin-row">
          <label>
            <span>管理员密码</span>
            <input
              value={adminPassword}
              type="password"
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="默认 admin123"
            />
          </label>
          <button
            className="primary-button"
            disabled={!adminPassword || busy === 'load'}
            onClick={() => void loadAll()}
          >
            {busy === 'load' ? <Loader2 className="spin" size={18} /> : <Shield size={18} />}
            <span>进入</span>
          </button>
        </div>
      </section>

      {isAuthed && (
        <>
          <nav className="admin-tabs" aria-label="后台功能">
            {tabs.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  className={activeTab === tab.key ? 'admin-tab active' : 'admin-tab'}
                  onClick={() => {
                    setActiveTab(tab.key);
                    void refreshTab(tab.key);
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {activeTab === 'overview' && overview && (
            <section className="admin-panel">
              <PanelTitle title="概览" onRefresh={() => void refreshTab('overview')} />
              <div className="stat-grid">
                <StatCard label="用户" value={overview.stats.userCount} />
                <StatCard label="视频" value={overview.stats.videoCount} />
                <StatCard label="上架视频" value={overview.stats.activeVideoCount} />
                <StatCard label="订单" value={overview.stats.orderCount} />
                <StatCard label="已支付" value={overview.stats.paidOrderCount} />
                <StatCard label="有效权限" value={overview.stats.activeEntitlementCount} />
                <StatCard label="播放会话" value={overview.stats.playSessionCount} />
              </div>
              <DataTable
                headers={['订单号', '视频', '用户', '状态', '金额']}
                rows={overview.recentOrders.map((order) => [
                  order.orderCode,
                  order.video.title,
                  order.user.username || order.user.telegramUserId,
                  order.status,
                  formatMoney(order.amountCents, order.currency),
                ])}
              />
            </section>
          )}

          {activeTab === 'settings' && settings && (
            <SettingsPanel
              settings={settings}
              form={settingsForm}
              busy={busy}
              onChange={(key, value) =>
                setSettingsForm((current) => ({ ...current, [key]: value }))
              }
              onSave={saveSettings}
              onTestTelegram={testTelegram}
              onTestCloudflare={testCloudflare}
            />
          )}

          {activeTab === 'payments' && settings && (
            <PaymentsPanel
              settings={settings}
              form={settingsForm}
              busy={busy}
              onChange={(key, value) =>
                setSettingsForm((current) => ({ ...current, [key]: value }))
              }
              onSave={saveSettings}
            />
          )}

          {activeTab === 'videos' && (
            <section className="admin-panel">
              <PanelTitle title="视频管理" onRefresh={() => void refreshTab('videos')} />
              <div className="filter-row">
                <input
                  value={filters.videos}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      videos: event.target.value,
                    }))
                  }
                  placeholder="搜索标题或 UID"
                />
                <select
                  value={filters.videoStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      videoStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">全部状态</option>
                  <option value="ACTIVE">上架</option>
                  <option value="DRAFT">草稿</option>
                  <option value="ARCHIVED">归档</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshTab('videos')}>
                  筛选
                </button>
              </div>
              <div className="admin-grid">
                <label>
                  <span>标题</span>
                  <input
                    value={videoForm.title}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Cloudflare Video UID</span>
                  <input
                    value={videoForm.cloudflareVideoUid}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        cloudflareVideoUid: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>价格分</span>
                  <input
                    value={videoForm.priceCents}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        priceCents: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>状态</span>
                  <select
                    value={videoForm.status}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="ACTIVE">上架</option>
                    <option value="DRAFT">草稿</option>
                    <option value="ARCHIVED">归档</option>
                  </select>
                </label>
                <label className="wide-field">
                  <span>描述</span>
                  <textarea
                    value={videoForm.description}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                  />
                </label>
              </div>
              <button
                className="primary-button"
                disabled={busy === 'save-video'}
                onClick={() => void saveVideo()}
              >
                {busy === 'save-video' ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                <span>新建视频</span>
              </button>

              <div className="admin-video-list">
                {localVideos.map((video) => (
                  <article className="admin-video-item" key={video.id}>
                    <div>
                      <strong>{video.title}</strong>
                      <span>{video.cloudflareVideoUid}</span>
                      <small>
                        {video.status} · {formatMoney(video.priceCents, video.currency)}
                        · 订单 {video.counts.orders} · 播放 {video.counts.playSessions}
                      </small>
                    </div>
                    <div className="item-actions">
                      <button
                        className="secondary-button"
                        disabled={busy === `video-${video.id}`}
                        onClick={() => startEditVideo(video)}
                      >
                        编辑
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy === `video-${video.id}`}
                        onClick={() =>
                          void updateVideo(
                            video,
                            video.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE',
                          )
                        }
                      >
                        {video.status === 'ACTIVE' ? '下架' : '上架'}
                      </button>
                      <button
                        className="secondary-button danger"
                        disabled={busy === `video-${video.id}`}
                        onClick={() => void updateVideo(video, 'ARCHIVED')}
                      >
                        归档
                      </button>
                    </div>
                    {editingVideoId === video.id && (
                      <div className="inline-editor">
                        <label>
                          <span>标题</span>
                          <input
                            value={editVideoForm.title}
                            onChange={(event) =>
                              setEditVideoForm((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Cloudflare Video UID</span>
                          <input
                            value={editVideoForm.cloudflareVideoUid}
                            onChange={(event) =>
                              setEditVideoForm((current) => ({
                                ...current,
                                cloudflareVideoUid: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>价格分</span>
                          <input
                            value={editVideoForm.priceCents}
                            onChange={(event) =>
                              setEditVideoForm((current) => ({
                                ...current,
                                priceCents: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>币种</span>
                          <input
                            value={editVideoForm.currency}
                            onChange={(event) =>
                              setEditVideoForm((current) => ({
                                ...current,
                                currency: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>状态</span>
                          <select
                            value={editVideoForm.status}
                            onChange={(event) =>
                              setEditVideoForm((current) => ({
                                ...current,
                                status: event.target.value,
                              }))
                            }
                          >
                            <option value="ACTIVE">上架</option>
                            <option value="DRAFT">草稿</option>
                            <option value="ARCHIVED">归档</option>
                          </select>
                        </label>
                        <label className="wide-field">
                          <span>描述</span>
                          <textarea
                            value={editVideoForm.description}
                            onChange={(event) =>
                              setEditVideoForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            rows={3}
                          />
                        </label>
                        <div className="inline-editor-actions">
                          <button
                            className="primary-button"
                            disabled={busy === `edit-video-${video.id}`}
                            onClick={() => void saveVideoEdit(video)}
                          >
                            {busy === `edit-video-${video.id}` ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                            <span>保存</span>
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => setEditingVideoId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'cloudflare' && (
            <section className="admin-panel">
              <PanelTitle title="Cloudflare 视频导入" onRefresh={loadCloudflareVideos} />
              <div className="admin-video-list">
                {cloudflareVideos.map((video) => (
                  <article className="admin-video-item" key={video.uid}>
                    <div>
                      <strong>{video.name}</strong>
                      <span>{video.uid}</span>
                      {video.state && <small>{video.state}</small>}
                    </div>
                    <button
                      className="secondary-button"
                      disabled={busy === video.uid}
                      onClick={() => void importVideo(video)}
                    >
                      {busy === video.uid ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
                      <span>导入</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'orders' && (
            <section className="admin-panel">
              <PanelTitle title="订单和权限" onRefresh={() => void refreshTab('orders')} />
              <div className="filter-row">
                <input
                  value={filters.orders}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      orders: event.target.value,
                    }))
                  }
                  placeholder="订单号 / 用户 / 视频"
                />
                <select
                  value={filters.orderStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      orderStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">全部状态</option>
                  <option value="PENDING">待支付</option>
                  <option value="PAID">已支付</option>
                  <option value="CANCELLED">已取消</option>
                  <option value="REFUNDED">已退款</option>
                </select>
                <select
                  value={filters.orderProvider}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      orderProvider: event.target.value,
                    }))
                  }
                >
                  <option value="">全部支付方式</option>
                  <option value="mock">模拟支付</option>
                  <option value="manual">手动支付</option>
                  <option value="telegram">Telegram</option>
                  <option value="usdt">USDT</option>
                  <option value="stripe">Stripe</option>
                  <option value="admin">后台发放</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshTab('orders')}>
                  筛选
                </button>
              </div>
              <div className="admin-grid">
                <label>
                  <span>Telegram User ID</span>
                  <input
                    value={grantForm.telegramUserId}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        telegramUserId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>用户名</span>
                  <input
                    value={grantForm.username}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>视频</span>
                  <select
                    value={grantForm.videoId}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        videoId: event.target.value,
                      }))
                    }
                  >
                    <option value="">选择视频</option>
                    {activeVideos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="primary-button"
                disabled={busy === 'manual-grant'}
                onClick={() => void manualGrant()}
              >
                <Shield size={18} />
                <span>手动发放权限</span>
              </button>

              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>订单</th>
                      <th>视频</th>
                      <th>用户</th>
                      <th>状态</th>
                      <th>权限</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.orderCode}</td>
                        <td>{order.video.title}</td>
                        <td>{order.user.username || order.user.telegramUserId}</td>
                        <td>{order.status}</td>
                        <td>{order.entitlement?.status || '无'}</td>
                        <td>
                          <div className="table-actions">
                            {order.status !== 'PAID' && (
                              <button onClick={() => void grantOrder(order)}>
                                标记支付
                              </button>
                            )}
                            <button onClick={() => void loadOrderDetail(order)}>
                              详情
                            </button>
                            {order.entitlement?.status === 'ACTIVE' && (
                              <button
                                onClick={() =>
                                  void changeEntitlement(
                                    order.entitlement!.id,
                                    'revoke',
                                  )
                                }
                              >
                                撤销
                              </button>
                            )}
                            {order.entitlement?.status === 'REVOKED' && (
                              <button
                                onClick={() =>
                                  void changeEntitlement(
                                    order.entitlement!.id,
                                    'restore',
                                  )
                                }
                              >
                                恢复
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedOrder && (
                <OrderDetailPanel
                  order={selectedOrder}
                  onClose={() => setSelectedOrder(null)}
                />
              )}
            </section>
          )}

          {activeTab === 'users' && (
            <section className="admin-panel">
              <PanelTitle title="用户" onRefresh={() => void refreshTab('users')} />
              <div className="filter-row">
                <input
                  value={filters.users}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      users: event.target.value,
                    }))
                  }
                  placeholder="Telegram ID / 用户名"
                />
                <button className="secondary-button" onClick={() => void refreshTab('users')}>
                  筛选
                </button>
              </div>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Telegram ID</th>
                      <th>用户名</th>
                      <th>订单</th>
                      <th>权限</th>
                      <th>播放</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.telegramUserId}</td>
                        <td>{user.username || user.firstName || '-'}</td>
                        <td>{user.counts.orders}</td>
                        <td>{user.counts.entitlements}</td>
                        <td>{user.counts.playSessions}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>
                          <div className="table-actions">
                            <button onClick={() => void loadUserDetail(user)}>
                              详情
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedUser && (
                <UserDetailPanel
                  user={selectedUser}
                  onClose={() => setSelectedUser(null)}
                />
              )}
            </section>
          )}

          {activeTab === 'sessions' && (
            <section className="admin-panel">
              <PanelTitle title="播放记录" onRefresh={() => void refreshTab('sessions')} />
              <div className="filter-row">
                <input
                  value={filters.sessions}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      sessions: event.target.value,
                    }))
                  }
                  placeholder="Session / 订单号 / 用户 / 视频 / IP"
                />
                <button className="secondary-button" onClick={() => void refreshTab('sessions')}>
                  筛选
                </button>
              </div>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>订单</th>
                      <th>视频</th>
                      <th>用户</th>
                      <th>IP</th>
                      <th>事件</th>
                      <th>最后心跳</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.sessionCode}</td>
                        <td>{session.order.orderCode}</td>
                        <td>{session.video.title}</td>
                        <td>{session.user.username || session.user.telegramUserId}</td>
                        <td>{session.ipAddress || '-'}</td>
                        <td>{session.eventCount}</td>
                        <td>{session.lastSeenAt ? formatDate(session.lastSeenAt) : '-'}</td>
                        <td>
                          <div className="table-actions">
                            <button onClick={() => void loadSessionDetail(session)}>
                              事件
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedSession && (
                <SessionDetailPanel
                  session={selectedSession}
                  onClose={() => setSelectedSession(null)}
                />
              )}
            </section>
          )}

          {activeTab === 'logs' && (
            <section className="admin-panel">
              <PanelTitle title="活动日志" onRefresh={() => void refreshTab('logs')} />
              <div className="filter-row">
                <input
                  value={filters.logs}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      logs: event.target.value,
                    }))
                  }
                  placeholder="动作 / 对象 / 消息"
                />
                <button className="secondary-button" onClick={() => void refreshTab('logs')}>
                  筛选
                </button>
              </div>
              <DataTable
                headers={['时间', '动作', '对象', '操作者', '消息', 'IP']}
                rows={logs.map((log) => [
                  formatDate(log.createdAt),
                  log.action,
                  `${log.entityType}${log.entityId ? `#${log.entityId}` : ''}`,
                  log.actorId || log.actorType,
                  log.message,
                  log.ipAddress || '-',
                ])}
              />
            </section>
          )}

          {activeTab === 'devtools' && (
            <section className="admin-panel">
              <PanelTitle title="开发工具" onRefresh={() => void refreshTab('devtools')} />
              <div className="admin-grid">
                <label>
                  <span>测试 Telegram User ID</span>
                  <input
                    value={devForm.telegramUserId}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        telegramUserId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>测试用户名</span>
                  <input
                    value={devForm.username}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>视频</span>
                  <select
                    value={devForm.videoId}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        videoId: event.target.value,
                      }))
                    }
                  >
                    <option value="">选择视频</option>
                    {localVideos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>支付方式</span>
                  <select
                    value={devForm.provider}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        provider: event.target.value,
                      }))
                    }
                  >
                    <option value="manual">手动支付</option>
                    <option value="mock">模拟支付</option>
                    <option value="telegram">Telegram</option>
                    <option value="usdt">USDT</option>
                    <option value="stripe">Stripe</option>
                  </select>
                </label>
                <label>
                  <span>订单状态</span>
                  <select
                    value={devForm.paid}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        paid: event.target.value,
                      }))
                    }
                  >
                    <option value="false">待支付</option>
                    <option value="true">已支付并授权</option>
                  </select>
                </label>
                <label>
                  <span>模拟回调订单号</span>
                  <input
                    value={devForm.orderCode}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        orderCode: event.target.value,
                      }))
                    }
                    placeholder="创建测试订单后自动填入"
                  />
                </label>
              </div>
              <section className="admin-actions">
                <button className="primary-button" onClick={() => void createTestUser()}>
                  创建测试用户
                </button>
                <button className="secondary-button" onClick={() => void createTestOrder()}>
                  创建测试订单
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void simulateTelegramPayment()}
                >
                  模拟 Telegram 支付
                </button>
                <button className="secondary-button danger" onClick={() => void clearPlaySessions()}>
                  清理播放记录
                </button>
              </section>
            </section>
          )}
        </>
      )}

      {message && <div className="success-line">{message}</div>}
      {error && <div className="error-line">{error}</div>}
    </main>
  );
}

function SettingsPanel({
  settings,
  form,
  busy,
  onChange,
  onSave,
  onTestTelegram,
  onTestCloudflare,
}: {
  settings: AdminSettings;
  form: typeof emptySettingsForm;
  busy: string | null;
  onChange: (key: keyof typeof emptySettingsForm, value: string) => void;
  onSave: () => void;
  onTestTelegram: () => void;
  onTestCloudflare: () => void;
}) {
  return (
    <>
      <section className="admin-panel">
        <h2>Telegram Bot</h2>
        <SecretStatus label="Bot Token" field={settings.telegramBotToken} />
        <label>
          <span>Bot Token</span>
          <input
            value={form.telegramBotToken}
            onChange={(event) => onChange('telegramBotToken', event.target.value)}
            placeholder="留空则保留已保存 Token"
          />
        </label>
      </section>

      <section className="admin-panel">
        <h2>Cloudflare Stream</h2>
        <div className="admin-grid">
          <label>
            <span>Account ID</span>
            <input
              value={form.cloudflareAccountId}
              onChange={(event) => onChange('cloudflareAccountId', event.target.value)}
            />
          </label>
          <label>
            <span>API Token</span>
            <input
              value={form.cloudflareApiToken}
              onChange={(event) => onChange('cloudflareApiToken', event.target.value)}
              placeholder="留空则保留已保存 Token"
            />
          </label>
          <label>
            <span>Stream Signing Key ID</span>
            <input
              value={form.cloudflareStreamSigningKeyId}
              onChange={(event) =>
                onChange('cloudflareStreamSigningKeyId', event.target.value)
              }
            />
          </label>
          <label>
            <span>Stream Signing Private Key</span>
            <textarea
              value={form.cloudflareStreamSigningPrivateKey}
              onChange={(event) =>
                onChange('cloudflareStreamSigningPrivateKey', event.target.value)
              }
              placeholder="留空则保留已保存私钥"
              rows={5}
            />
          </label>
          <label>
            <span>默认测试视频 UID</span>
            <input
              value={form.demoCloudflareVideoUid}
              onChange={(event) => onChange('demoCloudflareVideoUid', event.target.value)}
            />
          </label>
          <label>
            <span>官方水印</span>
            <input
              value={form.officialWatermarkText}
              onChange={(event) => onChange('officialWatermarkText', event.target.value)}
            />
          </label>
          <label>
            <span>单用户同时播放数</span>
            <input
              value={form.maxConcurrentPlaySessions}
              onChange={(event) =>
                onChange('maxConcurrentPlaySessions', event.target.value)
              }
              placeholder="1 表示只允许一个播放窗口，0 表示不限制"
            />
          </label>
        </div>
        <div className="secret-list">
          <SecretStatus label="API Token" field={settings.cloudflareApiToken} />
          <SecretStatus
            label="Signing Private Key"
            field={settings.cloudflareStreamSigningPrivateKey}
          />
        </div>
      </section>

      <section className="admin-actions">
        <button
          className="primary-button"
          disabled={busy === 'save-settings'}
          onClick={onSave}
        >
          {busy === 'save-settings' ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          <span>保存配置</span>
        </button>
        <button className="secondary-button" onClick={onTestTelegram}>
          <CheckCircle2 size={18} />
          <span>测试 Telegram</span>
        </button>
        <button className="secondary-button" onClick={onTestCloudflare}>
          <Cloud size={18} />
          <span>测试 Cloudflare</span>
        </button>
      </section>
    </>
  );
}

function PaymentsPanel({
  settings,
  form,
  busy,
  onChange,
  onSave,
}: {
  settings: AdminSettings;
  form: typeof emptySettingsForm;
  busy: string | null;
  onChange: (key: keyof typeof emptySettingsForm, value: string) => void;
  onSave: () => void;
}) {
  const telegramEnabled = form.telegramPaymentsEnabled === 'true';

  return (
    <>
      <section className="admin-panel">
        <h2>支付方式</h2>
        <article className="payment-method">
          <div className="payment-method-header">
            <div>
              <strong>本地模拟支付</strong>
              <span>{settings.mockPaymentsEnabled.value === 'true' ? '已启用' : '未启用'}</span>
            </div>
            <button className="toggle-button active" type="button" disabled>
              本地
            </button>
          </div>
          <p className="muted-line">
            普通浏览器本地测试会走模拟支付，用来验证下单、授权、播放闭环。
          </p>
        </article>
        <article className="payment-method">
          <div className="payment-method-header">
            <div>
              <strong>Telegram Payments</strong>
              <span>{telegramEnabled ? '已启用' : '未启用'}</span>
            </div>
            <button
              className={telegramEnabled ? 'toggle-button active' : 'toggle-button'}
              type="button"
              onClick={() =>
                onChange(
                  'telegramPaymentsEnabled',
                  telegramEnabled ? 'false' : 'true',
                )
              }
            >
              {telegramEnabled ? '停用' : '启用'}
            </button>
          </div>

          <div className="secret-list">
            <SecretStatus
              label="Provider Token"
              field={settings.telegramPaymentProviderToken}
            />
          </div>

          <label>
            <span>Provider Token</span>
            <input
              value={form.telegramPaymentProviderToken}
              onChange={(event) =>
                onChange('telegramPaymentProviderToken', event.target.value)
              }
              placeholder="BotFather Payments 里获得，留空保留已保存 Token"
            />
          </label>
        </article>
        <article className="payment-method muted-method">
          <div className="payment-method-header">
            <div>
              <strong>手动支付 / USDT / Stripe</strong>
              <span>待接入</span>
            </div>
            <button className="toggle-button" type="button" disabled>
              占位
            </button>
          </div>
        </article>
      </section>

      <section className="admin-actions">
        <button
          className="primary-button"
          disabled={busy === 'save-settings'}
          onClick={onSave}
        >
          {busy === 'save-settings' ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          <span>保存支付设置</span>
        </button>
      </section>
    </>
  );
}

function OrderDetailPanel({
  order,
  onClose,
}: {
  order: AdminOrderDetail;
  onClose: () => void;
}) {
  return (
    <section className="detail-panel">
      <div className="panel-title-row">
        <h2>订单详情 {order.orderCode}</h2>
        <button className="secondary-button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="detail-grid">
        <DetailItem label="订单状态" value={order.status} />
        <DetailItem label="支付方式" value={order.provider} />
        <DetailItem
          label="支付流水"
          value={order.providerPaymentId || '-'}
        />
        <DetailItem label="金额" value={formatMoney(order.amountCents, order.currency)} />
        <DetailItem label="创建时间" value={formatDate(order.createdAt)} />
        <DetailItem label="支付时间" value={order.paidAt ? formatDate(order.paidAt) : '-'} />
        <DetailItem label="用户" value={order.user.username || order.user.telegramUserId} />
        <DetailItem label="Telegram ID" value={order.user.telegramUserId} />
        <DetailItem label="视频" value={order.video.title} />
        <DetailItem label="视频状态" value={order.video.status} />
        <DetailItem label="视频 UID" value={order.video.cloudflareVideoUid} />
        <DetailItem label="权限状态" value={order.entitlement?.status || '无'} />
      </div>
      <DataTable
        headers={['Session', 'IP', '事件', '创建时间', '最后心跳']}
        rows={order.playSessions.map((session) => [
          session.sessionCode,
          session.ipAddress || '-',
          session.eventCount,
          formatDate(session.createdAt),
          session.lastSeenAt ? formatDate(session.lastSeenAt) : '-',
        ])}
      />
    </section>
  );
}

function UserDetailPanel({
  user,
  onClose,
}: {
  user: AdminUserDetail;
  onClose: () => void;
}) {
  return (
    <section className="detail-panel">
      <div className="panel-title-row">
        <h2>用户详情 {user.username || user.telegramUserId}</h2>
        <button className="secondary-button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="detail-grid">
        <DetailItem label="Telegram ID" value={user.telegramUserId} />
        <DetailItem label="用户名" value={user.username || '-'} />
        <DetailItem label="姓名" value={[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'} />
        <DetailItem label="语言" value={user.languageCode || '-'} />
        <DetailItem label="订单数" value={user.orders.length} />
        <DetailItem label="权限数" value={user.entitlements.length} />
      </div>
      <DataTable
        headers={['订单', '视频', '状态', '支付', '金额', '时间']}
        rows={user.orders.map((order) => [
          order.orderCode,
          order.video.title,
          order.status,
          order.provider,
          formatMoney(order.amountCents, order.currency),
          formatDate(order.createdAt),
        ])}
      />
      <DataTable
        headers={['权限', '视频', '订单', '状态', '开始时间']}
        rows={user.entitlements.map((entitlement) => [
          entitlement.id,
          entitlement.video.title,
          entitlement.order.orderCode,
          entitlement.status,
          formatDate(entitlement.startsAt),
        ])}
      />
      <DataTable
        headers={['Session', '订单', '视频', 'IP', '事件', '最后心跳']}
        rows={user.playSessions.map((session) => [
          session.sessionCode,
          session.order.orderCode,
          session.video.title,
          session.ipAddress || '-',
          session.eventCount,
          session.lastSeenAt ? formatDate(session.lastSeenAt) : '-',
        ])}
      />
    </section>
  );
}

function SessionDetailPanel({
  session,
  onClose,
}: {
  session: PlaySessionDetail;
  onClose: () => void;
}) {
  return (
    <section className="detail-panel">
      <div className="panel-title-row">
        <h2>播放事件 {session.sessionCode}</h2>
        <button className="secondary-button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="detail-grid">
        <DetailItem label="订单" value={session.order.orderCode} />
        <DetailItem label="视频" value={session.video.title} />
        <DetailItem label="用户" value={session.user.username || session.user.telegramUserId} />
        <DetailItem label="IP" value={session.ipAddress || '-'} />
        <DetailItem label="创建时间" value={formatDate(session.createdAt)} />
        <DetailItem label="过期时间" value={formatDate(session.tokenExpiresAt)} />
      </div>
      <DataTable
        headers={['时间', '事件', '播放位置']}
        rows={session.events.map((event) => [
          formatDate(event.createdAt),
          event.eventType,
          event.playbackPositionSeconds ?? '-',
        ])}
      />
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({
  title,
  onRefresh,
}: {
  title: string;
  onRefresh: () => void;
}) {
  return (
    <div className="panel-title-row">
      <h2>{title}</h2>
      <button className="icon-button" onClick={onRefresh} aria-label="刷新">
        <RefreshCw size={18} />
      </button>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="admin-table">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecretStatus({ label, field }: { label: string; field: FieldStatus }) {
  return (
    <div className="secret-status">
      <EyeOff size={16} />
      <span>{label}</span>
      <strong>{field.hasValue ? field.masked : '未配置'}</strong>
    </div>
  );
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
