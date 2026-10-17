// 内联 SVG 图标（路径取自 Lucide，ISC 许可）。按需内联，避免整包引入。
import type { JSX } from 'preact'

type P = { size?: number; class?: string; stroke?: number }

const mk = (paths: JSX.Element) => ({ size = 22, class: cls = '', stroke = 2 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" class={cls} aria-hidden="true">
    {paths}
  </svg>
)

export const IcGauge = mk(<><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></>)
export const IcUsers = mk(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>)
export const IcKey = mk(<><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" /><path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" /></>)
export const IcChat = mk(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />)
export const IcPlus = mk(<><path d="M5 12h14" /><path d="M12 5v14" /></>)
export const IcCopy = mk(<><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>)
export const IcCheck = mk(<path d="M20 6 9 17l-5-5" />)
export const IcMore = mk(<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>)
export const IcRefresh = mk(<><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>)
export const IcX = mk(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>)
export const IcChevronDown = mk(<path d="m6 9 6 6 6-6" />)
export const IcSend = mk(<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>)
export const IcStop = mk(<rect width="12" height="12" x="6" y="6" rx="2" />)
export const IcBrain = mk(<><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M12 5v13" /></>)
export const IcSearch = mk(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>)
export const IcLogout = mk(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>)
export const IcZap = mk(<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />)
export const IcExternal = mk(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>)
export const IcSliders = mk(<><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M2 14h4" /><path d="M10 8h4" /><path d="M18 16h4" /></>)
export const IcTrash = mk(<><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>)
export const IcPulse = mk(<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />)
