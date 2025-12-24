export const BarChart = ({ data, valueKey, labelKey = "name", valueLabel = "Score", maxValue }) => {
  const values = data.map(d => d[valueKey])
  const topValue = values[0]
  const minValue = Math.min(...values)
  const baselineOffset = topValue - (topValue - minValue) / 0.8 * 1
  
  return (
    <div className="space-y-3 my-6 not-prose">
      {data.map((item, idx) => {
        const value = item[valueKey]
        const percentage = ((value - baselineOffset) / (topValue - baselineOffset)) * 80
        const isDroid = item[labelKey].toLowerCase().includes('droid') || item[labelKey].toLowerCase().includes('factory')
        
        return (
          <div key={idx}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 text-sm font-mono text-zinc-400 dark:text-zinc-500 text-right">
                {idx + 1}
              </span>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {item[labelKey]}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6" />
              <div className="flex-1 h-7 relative flex items-center">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{ 
                    width: `${percentage}%`,
                    background: isDroid 
                      ? 'linear-gradient(to right, #f97316, #fb923c)' 
                      : 'linear-gradient(to right, #a1a1aa, #d4d4d8)'
                  }}
                />
                <span className="ml-2 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}{valueLabel.includes('%') ? '%' : ''}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const EloChart = ({ data, valueKey = "elo", labelKey = "name", baseline = 1200 }) => {
  const values = data.map(d => d[valueKey])
  const maxDelta = Math.max(...values.map(v => Math.abs(v - baseline)))
  
  return (
    <div className="space-y-3 my-6 not-prose">
      {data.map((item, idx) => {
        const value = item[valueKey]
        const delta = value - baseline
        const barWidth = (Math.abs(delta) / maxDelta) * 40
        const isAbove = delta >= 0
        const isDroid = item[labelKey].toLowerCase().includes('droid') || item[labelKey].toLowerCase().includes('factory')
        
        return (
          <div key={idx}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 text-sm font-mono text-zinc-400 dark:text-zinc-500 text-right">
                {idx + 1}
              </span>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {item[labelKey]}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6" />
              <div className="flex-1 h-7 relative flex items-center">
                <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-zinc-400 dark:border-zinc-500" />
                <div
                  className="absolute top-0 bottom-0 rounded-sm transition-all duration-500"
                  style={{ 
                    width: `${barWidth}%`,
                    left: isAbove ? '50%' : `${50 - barWidth}%`,
                    background: isDroid 
                      ? 'linear-gradient(to right, #f97316, #fb923c)' 
                      : isAbove 
                        ? 'linear-gradient(to right, #a1a1aa, #d4d4d8)'
                        : 'linear-gradient(to right, #d4d4d8, #a1a1aa)'
                  }}
                />
                <span 
                  className="absolute text-xs font-mono text-zinc-600 dark:text-zinc-400"
                  style={{
                    left: isAbove ? `${50 + barWidth + 1}%` : `${50 - barWidth - 1}%`,
                    transform: isAbove ? 'none' : 'translateX(-100%)'
                  }}
                >
                  {value}
                </span>
              </div>
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-3 mt-1">
        <div className="w-6" />
        <div className="flex-1 relative h-4">
          <div className="absolute left-1/2 -translate-x-1/2 text-xs font-mono text-zinc-400 dark:text-zinc-500">
            {baseline}
          </div>
        </div>
      </div>
    </div>
  )
}
