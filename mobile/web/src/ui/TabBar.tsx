import { Activity, KeyRound, MessageCircle, Users } from 'lucide-react';
import { haptic } from '../lib/device';

export type Tab = 'overview' | 'accounts' | 'keys' | 'chat';
const TABS: { id: Tab; label: string; Icon: typeof Activity }[] = [
  { id: 'overview', label: '概览', Icon: Activity },
  { id: 'accounts', label: '账号', Icon: Users },
  { id: 'keys', label: '密钥', Icon: KeyRound },
  { id: 'chat', label: '对话', Icon: MessageCircle },
];

// iOS 风格悬浮胶囊底栏（毛玻璃 + 安全区）
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
      <div className="glass flex w-full max-w-md items-center justify-around rounded-full border border-line p-1.5 shadow-xl shadow-black/10">
        {TABS.map(({ id, label, Icon }) => {
          const on = id === tab;
          return (
            <button key={id} onClick={() => { if (!on) { haptic(); onChange(id); } }} aria-current={on ? 'page' : undefined}
              className={`tap flex h-12 flex-1 flex-col items-center justify-center rounded-full text-[11px] font-medium transition-colors ${on ? 'bg-primary/12 text-primary' : 'text-ink-2'}`}>
              <Icon size={21} strokeWidth={on ? 2.4 : 2} />
              <span className="mt-0.5">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
