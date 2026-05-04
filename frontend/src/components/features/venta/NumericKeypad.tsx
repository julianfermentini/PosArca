interface NumericKeypadProps {
  value: string
  onChange: (value: string) => void
  onConfirm?: () => void
}

const KEYS = ['7','8','9','4','5','6','1','2','3','00','0','.']

export function NumericKeypad({ value, onChange, onConfirm }: NumericKeypadProps) {
  const handleKey = (key: string) => {
    if (key === 'DEL') {
      onChange(value.slice(0, -1))
      return
    }
    // No permitir más de 2 decimales
    if (key === '.' && value.includes('.')) return
    const [, decimals] = (value + key).split('.')
    if (decimals && decimals.length > 2) return

    onChange(value + key)
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          key={k}
          onPointerDown={(e) => { e.preventDefault(); handleKey(k) }}
          className="
            bg-white border-2 border-gray-200 rounded-xl
            text-2xl font-bold text-gray-800
            min-h-[64px] flex items-center justify-center
            active:bg-blue-50 active:border-blue-400 active:scale-95
            transition-all duration-75 touch-manipulation select-none
          "
        >
          {k}
        </button>
      ))}
      <button
        onPointerDown={(e) => { e.preventDefault(); handleKey('DEL') }}
        className="
          bg-amber-50 border-2 border-amber-300 rounded-xl
          text-xl font-bold text-amber-700
          min-h-[64px] flex items-center justify-center
          active:bg-amber-100 active:scale-95
          transition-all duration-75 touch-manipulation select-none
        "
      >
        ⌫
      </button>
      <button
        onPointerDown={(e) => { e.preventDefault(); onConfirm?.() }}
        className="
          col-span-2 bg-blue-600 rounded-xl
          text-xl font-bold text-white
          min-h-[64px] flex items-center justify-center
          active:bg-blue-700 active:scale-95
          transition-all duration-75 touch-manipulation select-none
        "
      >
        Agregar ✓
      </button>
    </div>
  )
}
