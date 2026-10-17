import { go, keyboardOpen, tab, type Tab } from '../stores/router'
import { haptic } from '../stores/toast'
import { IcChat, IcGauge, IcKey, IcUsers } from './icons'

const ITEMS: { id: Tab; label: string; Icon: typeof IcGauge }[] = [
  { id: 'dash', label: '概览', Icon: IcGauge },
  { id: 'accounts', label: '账号', Icon: IcUsers },
  { id: 'keys', label: '密钥', Icon: IcKey },
  { id: 'chat', label: '对话', Icon: IcChat },
]

/** iOS 式悬浮胶囊底栏：毛玻璃、距底部安全区 12px、拇指热区。 */
export function TabBar() {
  if (keyboardOpen.value) return null
  return (
    <nav class="fixed inset-x-0 bottom-safe z-40 flex justify-center pointer-events-none" aria-label="主导航">
      <div class="pointer-events-auto glass border border-line/70 shadow-[0_10px_40px_rgba(0,0,0,.35)] rounded-full p-1.5 flex gap-1">
        {ITEMS.map(({ id, label, Icon }) => {
          const on = tab.value === id
          return (
            <button key={id} type="button" aria-current={on ? 'page' : undefined}
              onClick={() => { haptic(5); go(id) }}
              class={`press h-14 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all ${on ? 'bg-primary-soft text-primary w-[84px]' : 'text-ink-2 w-[70px]'}`}>
              <Icon size={22} stroke={on ? 2.4 : 2} />
              <span class="text-[11px] font-semibold">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
