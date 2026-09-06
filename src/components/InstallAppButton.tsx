import { useEffect, useState } from 'react';
import { Download, MonitorDown } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setMessage('');
    };

    const handleInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setMessage('ThinkTime Pro is installed on this computer.');
    };

    const media = window.matchMedia('(display-mode: standalone)');
    const handleDisplayMode = () => setInstalled(isStandalone());

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    media.addEventListener?.('change', handleDisplayMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
      media.removeEventListener?.('change', handleDisplayMode);
    };
  }, []);

  const install = async () => {
    setMessage('');

    if (installed) {
      setMessage('ThinkTime Pro is already running as an installed app.');
      return;
    }

    if (!promptEvent) {
      const ua = navigator.userAgent.toLowerCase();
      const isFirefoxLinux = ua.includes('firefox') && ua.includes('linux');
      setMessage(isFirefoxLinux
        ? 'Firefox on Linux does not provide ThinkTime with a native PWA install prompt. Use the included ./install.sh for an application-menu install, or open ThinkTime in Chromium/Chrome/Edge for an app-style window.'
        : 'Your browser did not provide an install prompt. Open the browser menu and choose Install app/Create shortcut, or use the included Linux installer.');
      return;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setMessage('ThinkTime Pro installation started.');
      }
      setPromptEvent(null);
    } catch {
      setMessage('The browser could not start installation. Try the browser Install app option instead.');
    }
  };

  if (installed && !message) return null;

  return (
    <div className={compact ? 'space-y-2' : 'mt-5 space-y-2'}>
      <button
        type="button"
        onClick={install}
        className={compact
          ? 'inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20'
          : 'w-full inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-300 transition hover:bg-sky-500/20'}
      >
        {promptEvent ? <Download className="h-4 w-4" /> : <MonitorDown className="h-4 w-4" />}
        Install ThinkTime Pro on this PC
      </button>
      {message && <p className="text-center text-xs text-slate-500">{message}</p>}
    </div>
  );
}
