/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openInvoice?: (
    invoiceLink: string,
    callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void,
  ) => void;
  MainButton?: {
    hide: () => void;
  };
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
