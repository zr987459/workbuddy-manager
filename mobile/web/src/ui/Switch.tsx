export function Switch({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string;
}) {
  return (
    <button
      role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`relative h-8 w-[52px] shrink-0 rounded-full p-0 transition-colors disabled:opacity-50 ${checked ? 'bg-ok' : 'bg-ink-2/30'}`}
    >
      <span className={`absolute left-0 top-1 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[24px]' : 'translate-x-1'}`} />
    </button>
  );
}
