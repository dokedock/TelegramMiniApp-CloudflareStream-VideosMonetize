import {
  ArrowLeft,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, type PlayResponse, type Video } from './api';

type User = {
  id: number;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
};

type AuthResponse = {
  user: User;
};

type VideosResponse = {
  videos: Video[];
};

type OrderResponse = {
  order: {
    orderCode: string;
    status: string;
  };
};

type TelegramInvoiceResponse = {
  alreadyPaid: boolean;
  invoiceLink?: string;
  order: {
    orderCode: string;
    status: string;
  };
};

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'USD',
});

const localPaymentMethods = [
  { value: 'mock', label: '模拟支付' },
  { value: 'manual', label: '手动支付' },
  { value: 'usdt', label: 'USDT 占位' },
  { value: 'stripe', label: 'Stripe 占位' },
];

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [playback, setPlayback] = useState<PlayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyVideoId, setBusyVideoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentMethodByVideoId, setPaymentMethodByVideoId] = useState<
    Record<number, string>
  >({});

  async function load() {
    setError(null);
    setLoading(true);

    try {
      const auth = await apiFetch<AuthResponse>('/api/auth/telegram', {
        method: 'POST',
      });
      const catalog = await apiFetch<VideosResponse>('/api/videos');

      setUser(auth.user);
      setVideos(catalog.videos);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function purchase(video: Video) {
    setError(null);
    setNotice(null);
    setBusyVideoId(video.id);

    try {
      if (window.Telegram?.WebApp.initData && window.Telegram.WebApp.openInvoice) {
        const invoice = await apiFetch<TelegramInvoiceResponse>(
          '/api/payments/telegram/invoice',
          {
            method: 'POST',
            body: JSON.stringify({ videoId: video.id }),
          },
        );

        if (invoice.alreadyPaid) {
          await load();
          await startPlayback({ ...video, hasAccess: true });
          return;
        }

        if (!invoice.invoiceLink) {
          throw new Error('发票链接创建失败');
        }

        await new Promise<void>((resolve, reject) => {
          window.Telegram!.WebApp.openInvoice!(invoice.invoiceLink!, (status) => {
            if (status === 'paid') {
              resolve();
              return;
            }

            reject(new Error(status === 'cancelled' ? '支付已取消' : '支付未完成'));
          });
        });

        await load();
        await startPlayback({ ...video, hasAccess: true });
        return;
      }

      const paymentMethod = paymentMethodByVideoId[video.id] || 'mock';
      const orderResponse = await apiFetch<OrderResponse>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ videoId: video.id, paymentMethod }),
      });
      await load();

      if (orderResponse.order.status !== 'PAID') {
        setNotice(
          `订单 ${orderResponse.order.orderCode} 已创建，当前为待支付。可在后台订单里标记支付。`,
        );
        return;
      }

      await startPlayback({ ...video, hasAccess: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '购买失败');
    } finally {
      setBusyVideoId(null);
    }
  }

  async function startPlayback(video: Video) {
    setError(null);
    setNotice(null);
    setBusyVideoId(video.id);

    try {
      const playResponse = await apiFetch<PlayResponse>(
        `/api/videos/${video.id}/play`,
        { method: 'POST' },
      );
      setActiveVideo(video);
      setPlayback(playResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '播放失败');
    } finally {
      setBusyVideoId(null);
    }
  }

  if (playback && activeVideo) {
    return (
      <PlayerView
        video={activeVideo}
        playback={playback}
        onBack={() => {
          setPlayback(null);
          setActiveVideo(null);
          void load();
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Private Video</p>
          <h1>视频库</h1>
        </div>
        <button className="icon-button" onClick={() => void load()} aria-label="刷新">
          <RefreshCw size={18} />
        </button>
      </header>

      {user && (
        <section className="account-strip">
          <ShieldCheck size={17} />
          <span>{user.username ? `@${user.username}` : user.firstName || 'Telegram User'}</span>
        </section>
      )}

      {error && <div className="error-line">{error}</div>}
      {notice && <div className="success-line">{notice}</div>}

      {loading ? (
        <div className="loading-state">
          <Loader2 className="spin" size={24} />
        </div>
      ) : (
        <section className="video-grid">
          {videos.map((video) => (
            <article className="video-card" key={video.id}>
              <div className="video-meta">
                <h2>{video.title}</h2>
                <p>{video.description}</p>
              </div>
              <div className="video-actions">
                <span className={video.hasAccess ? 'access-pill active' : 'access-pill'}>
                  {video.hasAccess ? '已购买' : currency.format(video.priceCents / 100)}
                </span>
                {!video.hasAccess && !window.Telegram?.WebApp.initData && (
                  <select
                    className="payment-select"
                    value={paymentMethodByVideoId[video.id] || 'mock'}
                    onChange={(event) =>
                      setPaymentMethodByVideoId((current) => ({
                        ...current,
                        [video.id]: event.target.value,
                      }))
                    }
                    aria-label="支付方式"
                  >
                    {localPaymentMethods.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="primary-button"
                  disabled={busyVideoId === video.id}
                  onClick={() =>
                    video.hasAccess ? void startPlayback(video) : void purchase(video)
                  }
                >
                  {busyVideoId === video.id ? (
                    <Loader2 className="spin" size={18} />
                  ) : video.hasAccess ? (
                    <Play size={18} />
                  ) : (
                    <ShoppingCart size={18} />
                  )}
                  <span>{video.hasAccess ? '播放' : '购买'}</span>
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function PlayerView({
  video,
  playback,
  onBack,
}: {
  video: Video;
  playback: PlayResponse;
  onBack: () => void;
}) {
  const [positionIndex, setPositionIndex] = useState(0);
  const endedSentRef = useRef(false);
  const watermarkPositions = useMemo(
    () => [
      { top: '18%', left: '12%' },
      { top: '42%', left: '58%' },
      { top: '68%', left: '18%' },
      { top: '30%', left: '36%' },
      { top: '74%', left: '62%' },
    ],
    [],
  );
  const sendEvent = useCallback(
    (eventType: 'play' | 'pause' | 'heartbeat' | 'ended') =>
      apiFetch(`/api/play-sessions/${playback.sessionCode}/events`, {
        method: 'POST',
        body: JSON.stringify({ eventType }),
      }).catch(() => undefined),
    [playback.sessionCode],
  );
  const sendEnded = useCallback(() => {
    if (endedSentRef.current) {
      return;
    }

    endedSentRef.current = true;
    void sendEvent('ended');
  }, [sendEvent]);

  useEffect(() => {
    const movement = window.setInterval(() => {
      setPositionIndex((current) => (current + 1) % watermarkPositions.length);
    }, 10000);

    const heartbeat = window.setInterval(() => {
      void sendEvent('heartbeat');
    }, 20000);

    const handleVisibilityChange = () => {
      void sendEvent(document.hidden ? 'pause' : 'play');
    };
    const handlePageHide = () => {
      sendEnded();
    };

    void sendEvent('play');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(movement);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      sendEnded();
    };
  }, [sendEnded, sendEvent, watermarkPositions.length]);

  const orderPosition = watermarkPositions[positionIndex];
  const isDemo = playback.playbackUrl.includes('demo-video-uid');

  return (
    <main className="player-page">
      <header className="player-header">
        <button
          className="icon-button"
          onClick={() => {
            sendEnded();
            onBack();
          }}
          aria-label="返回"
        >
          <ArrowLeft size={19} />
        </button>
        <h1>{video.title}</h1>
      </header>

      <section className="player-shell">
        {isDemo ? (
          <div className="demo-player">
            <Play size={42} />
            <span>Cloudflare Stream UID 未配置</span>
          </div>
        ) : (
          <iframe
            className="stream-frame"
            src={playback.playbackUrl}
            title={video.title}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
          />
        )}

        <div className="official-watermark">{playback.watermarks.official}</div>
        <div className="order-watermark" style={orderPosition}>
          {playback.watermarks.orderCode}
        </div>
      </section>
    </main>
  );
}
