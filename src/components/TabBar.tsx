import type { Tab } from '../types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export function TabBar({ tabs, activeTabId, onSelect, onClose }: TabBarProps) {
  if (tabs.length === 0) return null

  return (
    <div className="flex items-stretch bg-slate-950 border-b border-slate-700 overflow-x-auto flex-shrink-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer border-r border-slate-700 whitespace-nowrap select-none min-w-0 max-w-48 flex-shrink-0
              ${
                isActive
                  ? 'bg-slate-800 text-white border-t-2 border-t-indigo-400 pt-[4px]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
          >
            <span className="truncate flex-1">{tab.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.id)
              }}
              className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-slate-600 hover:text-white transition-colors
                ${isActive ? 'text-slate-400' : 'text-transparent group-hover:text-slate-500'}`}
              aria-label={`Close ${tab.label}`}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
