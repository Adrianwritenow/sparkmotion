'use client';

interface ConnectionStatusProps {
  state: 'connecting' | 'connected' | 'disconnected';
  lastUpdated: Date | null;
  onRetry: () => void;
}

export function ConnectionStatus({ state, lastUpdated, onRetry }: ConnectionStatusProps) {
  // Calculate time ago
  const getTimeAgo = () => {
    if (!lastUpdated) return 'never';
    const minutesAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
    if (minutesAgo === 0) return 'just now';
    if (minutesAgo === 1) return '1 min ago';
    if (minutesAgo < 60) return `${minutesAgo} min ago`;
    const hoursAgo = Math.floor(minutesAgo / 60);
    return `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
  };

  const statusConfig = {
    connected: {
      color: 'bg-green-500',
      text: 'Connected',
      showTime: false,
    },
    connecting: {
      color: 'bg-yellow-500',
      text: 'Connecting...',
      showTime: false,
    },
    disconnected: {
      color: 'bg-red-500',
      text: 'Connection lost',
      showTime: true,
    },
  };

  const config = statusConfig[state];

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-sm text-muted-foreground">
        {config.text}
        {config.showTime && lastUpdated && (
          <> - Last updated: {getTimeAgo()}</>
        )}
      </span>
      {state === 'disconnected' && (
        <button
          onClick={onRetry}
          className="ml-2 text-sm text-blue-600 hover:underline"
        >
          Click to retry
        </button>
      )}
    </div>
  );
}
