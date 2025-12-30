import { useEffect, useMemo, useState } from 'react'
import './App.css'

const toNumber = (value) => {
  if (value === undefined || value === null) return 0
  const cleaned = String(value).replace(/[$,]/g, '').trim()
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseCSV = (text) => {
  const rows = []
  let row = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(current)
      current = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1
      }
      row.push(current)
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row)
      }
      row = []
      current = ''
      continue
    }

    current += char
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current)
    rows.push(row)
  }

  const headers = rows.shift()?.map((header) => header.trim()) ?? []
  return rows
    .filter((cells) => cells.length > 1)
    .map((cells) => {
      const record = {}
      headers.forEach((header, index) => {
        record[header] = cells[index]?.trim() ?? ''
      })
      return record
    })
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)

const formatTxnLabel = (value) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : ''

const monthLabel = (month) => {
  if (!month) return ''
  const [year, mon] = month.split('-')
  const date = new Date(Number(year), Number(mon) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

const getMonthKey = (dateText) => (dateText ? dateText.slice(0, 7) : '')
const getMemberStatus = (lastBilledDate, latestBillDate) => {
  if (!lastBilledDate || !latestBillDate) return 'Past'
  const lastTime = lastBilledDate.getTime()
  const latestTime = latestBillDate.getTime()
  if (!Number.isFinite(lastTime) || !Number.isFinite(latestTime)) return 'Past'
  const fourWeeksMs = 28 * 24 * 60 * 60 * 1000
  return latestTime - lastTime <= fourWeeksMs ? 'Active' : 'Past'
}

const areaColors = [
  '#d66b4a',
  '#6f8b5d',
  '#3c6e9e',
  '#f0b36e',
  '#7d6b93',
  '#bd7b8a',
]

const buildStackedAreas = (series, width, height, scaleMax) => {
  if (!series.length) return []
  const pointsCount = series[0].values.length
  const maxTotal = Math.max(scaleMax || 1, 1)
  const cumulative = Array(pointsCount).fill(0)

  return series.map((item) => {
    const topLine = item.values.map((value, index) => {
      cumulative[index] += value
      return cumulative[index]
    })
    const bottomLine = topLine.map((value, index) => value - item.values[index])
    const topPoints = topLine.map((value, index) => {
      const x = (index / Math.max(1, pointsCount - 1)) * width
      const y = height - (value / maxTotal) * height
      return `${x},${y}`
    })
    const bottomPoints = bottomLine
      .slice()
      .reverse()
      .map((value, index) => {
        const x = ((pointsCount - 1 - index) / Math.max(1, pointsCount - 1)) * width
        const y = height - (value / maxTotal) * height
        return `${x},${y}`
      })
    const path = `M ${topPoints.join(' L ')} L ${bottomPoints.join(' L ')} Z`
    return {
      key: item.key,
      label: item.label,
      path,
      color: item.color,
    }
  })
}

const StackedAreaChart = ({ series, months, lineValues, lineLabel }) => {
  const width = 640
  const height = 220
  const padding = { top: 14, right: 18, bottom: 26, left: 46 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const maxTotal = useMemo(() => {
    if (!series.length) return 1
    const totals = Array(series[0].values.length).fill(0)
    series.forEach((item) => {
      item.values.forEach((value, index) => {
        totals[index] += value
      })
    })
    return Math.max(...totals, 1)
  }, [series])

  const { yTicks, scaleMax } = useMemo(() => {
    const baseStep = 2500
    const step =
      maxTotal <= baseStep ? 500 : maxTotal <= baseStep * 3 ? 1000 : baseStep
    const maxTick = Math.ceil(maxTotal / step) * step
    const ticks = []
    for (let value = 0; value <= maxTick; value += step) {
      const y = plotHeight - (value / maxTick) * plotHeight + padding.top
      ticks.push({ value, y })
    }
    return { yTicks: ticks, scaleMax: maxTick }
  }, [maxTotal, padding.top, plotHeight])

  const areas = useMemo(
    () => buildStackedAreas(series, plotWidth, plotHeight, scaleMax),
    [series, plotWidth, plotHeight, scaleMax]
  )

  const linePath = useMemo(() => {
    if (!lineValues || lineValues.length === 0) return ''
    const points = lineValues.map((value, index) => {
      const x = (index / Math.max(1, lineValues.length - 1)) * plotWidth
      const y = plotHeight - (value / scaleMax) * plotHeight
      return `${x + padding.left},${y + padding.top}`
    })
    return `M ${points.join(' L ')}`
  }, [lineValues, padding.left, padding.top, plotHeight, plotWidth, scaleMax])

  const xTicks = useMemo(() => {
    if (!months.length) return []
    const maxTicks = 10
    const step = Math.max(1, Math.ceil(months.length / maxTicks))
    return months
      .map((month, index) => ({ month, index }))
      .filter((item) => item.index % step === 0 || item.index === months.length - 1)
  }, [months])

  return (
    <div className="area-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <g className="area-grid">
          {yTicks.map((tick) => (
            <line
              key={tick.value}
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
            />
          ))}
        </g>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {areas.map((area) => (
            <path key={area.key} d={area.path} fill={area.color} opacity="0.8" />
          ))}
        </g>
        {linePath ? <path className="area-line" d={linePath} /> : null}
        <g className="area-y-axis">
          {yTicks.map((tick) => (
            <text key={tick.value} x={padding.left - 8} y={tick.y + 4}>
              {formatCurrency(tick.value)}
            </text>
          ))}
          <line
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={height - padding.bottom}
          />
        </g>
        <g className="area-x-axis">
          {xTicks.map((tick) => {
            const x =
              (tick.index / Math.max(1, months.length - 1)) * plotWidth + padding.left
            return (
              <text key={tick.month} x={x} y={height - padding.bottom + 18}>
                {monthLabel(tick.month)}
              </text>
            )
          })}
        </g>
      </svg>
      <div className="area-legend">
        {areas.map((area) => (
          <div key={area.key} className="legend-item">
            <span className="legend-swatch" style={{ background: area.color }} />
            <span>{area.label}</span>
          </div>
        ))}
        {lineLabel ? (
          <div className="legend-item">
            <span className="legend-line" />
            <span>{lineLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const TxColumnDialog = ({ column, transactions, position, sortKey, sortDir, filters, onSort, onFilter, onClose }) => {
  const uniqueValues = useMemo(() => {
    const values = new Set()
    transactions.forEach((tx) => {
      const value = tx[column.key]
      if (value !== undefined && value !== null && value !== '') {
        if (column.type === 'date') {
          values.add(value ? new Date(value).toLocaleDateString('en-US') : '—')
        } else if (column.type === 'currency') {
          return
        } else {
          values.add(String(value))
        }
      }
    })
    return Array.from(values).sort()
  }, [transactions, column])

  const showFilters = uniqueValues.length > 0 && uniqueValues.length <= 10

  const currentFilters = filters[column.key] || null

  const handleToggleValue = (value) => {
    const current = currentFilters ? new Set(currentFilters) : new Set(uniqueValues)
    if (current.has(value)) {
      current.delete(value)
    } else {
      current.add(value)
    }
    onFilter(column.key, current.size === uniqueValues.length ? null : current)
  }

  return (
    <>
      <div className="column-dialog-overlay" onClick={onClose} />
      <div
        className="column-dialog"
        style={{ top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="column-dialog-section">
          <button
            type="button"
            className={`column-dialog-btn ${sortKey === column.key && sortDir === 'asc' ? 'active' : ''}`}
            onClick={() => { onSort(column.key, 'asc'); onClose() }}
          >
            ↑ Sort A to Z
          </button>
          <button
            type="button"
            className={`column-dialog-btn ${sortKey === column.key && sortDir === 'desc' ? 'active' : ''}`}
            onClick={() => { onSort(column.key, 'desc'); onClose() }}
          >
            ↓ Sort Z to A
          </button>
        </div>
        {showFilters && (
          <div className="column-dialog-section">
            <div className="column-dialog-title">Filter</div>
            <div className="filter-scroll">
              {uniqueValues.map((value) => {
                const isChecked = !currentFilters || currentFilters.has(value)
                return (
                  <button
                    key={value}
                    type="button"
                    className="filter-option"
                    onClick={() => handleToggleValue(value)}
                  >
                    <span className={`filter-checkbox ${isChecked ? 'checked' : ''}`} />
                    <span className="filter-label">{value}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const TransactionTable = ({ member, billedRows, collectedRows, onClose }) => {
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [filters, setFilters] = useState({})
  const [dialogColumn, setDialogColumn] = useState(null)
  const [dialogPosition, setDialogPosition] = useState({ top: 0, left: 0 })

  const columns = useMemo(() => [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'amount', label: 'Billed', type: 'currency' },
    { key: 'gross', label: 'Collected', type: 'currency' },
    { key: 'fees', label: 'Management', type: 'currency' },
    { key: 'host', label: 'Net', type: 'currency' },
  ], [])

  const allTransactions = useMemo(() => {
    const memberId = member.memberId
    const billed = billedRows
      .filter((row) => row['Member ID'] === memberId)
      .map((row) => {
        const type = formatTxnLabel(row['Transaction Type'])
        const reason = formatTxnLabel(row['Transaction Reason'])
        const description = [type, reason].filter(Boolean).join(' - ') || 'Charge'
        return {
          date: row['Created'] || '',
          type: 'Billed',
          description,
          amount: -toNumber(row['Amount']),
          gross: null,
          fees: null,
          host: null,
        }
      })
    const collected = collectedRows
      .filter((row) => row['Member ID'] === memberId)
      .map((row) => ({
        date: row['Created'] || '',
        type: 'Collected',
        description: row['Bill Type'] || 'Payment',
        amount: null,
        gross: toNumber(row['Gross Collected'] ?? row['Gross Collected ']),
        fees: Math.abs(toNumber(row['Total Fees'])),
        host: toNumber(row['Host Earnings']),
      }))
    return [...billed, ...collected]
  }, [member.memberId, billedRows, collectedRows])

  const filteredTransactions = useMemo(() => {
    const filterKeys = Object.keys(filters)
    if (filterKeys.length === 0) return allTransactions

    return allTransactions.filter((tx) => {
      return filterKeys.every((key) => {
        const allowedValues = filters[key]
        if (!allowedValues || allowedValues.size === 0) return false
        const column = columns.find((c) => c.key === key)
        let txValue = tx[key]
        if (column?.type === 'date') {
          txValue = txValue ? new Date(txValue).toLocaleDateString('en-US') : '—'
        } else {
          txValue = String(txValue)
        }
        return allowedValues.has(txValue)
      })
    })
  }, [allTransactions, filters, columns])

  const sortedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions]
    const multiplier = sortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (sortKey === 'date') {
        const aTime = aVal ? new Date(aVal).getTime() : 0
        const bTime = bVal ? new Date(bVal).getTime() : 0
        return (aTime - bTime) * multiplier
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * multiplier
      }

      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1 * multiplier
      if (bVal === null) return -1 * multiplier

      return String(aVal).localeCompare(String(bVal)) * multiplier
    })
    return sorted
  }, [filteredTransactions, sortDir, sortKey])

  const handleHeaderClick = (column, event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setDialogPosition({
      top: rect.bottom + 4,
      left: Math.max(8, rect.left),
    })
    setDialogColumn(column)
  }

  const handleSort = (key, dir) => {
    setSortKey(key)
    setSortDir(dir)
  }

  const handleFilter = (key, values) => {
    setFilters((prev) => {
      const next = { ...prev }
      if (values === null) {
        delete next[key]
      } else {
        next[key] = values
      }
      return next
    })
  }

  const formatCell = (tx, column) => {
    const value = tx[column.key]
    switch (column.type) {
      case 'currency':
        return value !== null ? formatCurrency(value) : '—'
      case 'date':
        return value ? new Date(value).toLocaleDateString('en-US') : '—'
      default:
        return value || '—'
    }
  }

  return (
    <div className="transaction-overlay" onClick={onClose}>
      <div className="transaction-modal" onClick={(e) => e.stopPropagation()}>
        <div className="transaction-header">
          <div>
            <h3>{member.name || `Member ${member.memberId}`}</h3>
            <p>{member.street1} - {member.roomNumber}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="transaction-table">
          <div className="transaction-head">
            {columns.map((column) => (
              <button
                key={column.key}
                type="button"
                className={`tx-sort ${sortKey === column.key ? 'active' : ''}${filters[column.key] ? ' filtered' : ''}`}
                onClick={(e) => handleHeaderClick(column, e)}
              >
                <em>{sortKey === column.key ? (sortDir === 'asc' ? '↑ ' : '↓ ') : ''}</em>
                <span>{column.label}</span>
                {filters[column.key] && <span className="filter-indicator">●</span>}
              </button>
            ))}
          </div>
          {dialogColumn && (
            <TxColumnDialog
              column={dialogColumn}
              transactions={allTransactions}
              position={dialogPosition}
              sortKey={sortKey}
              sortDir={sortDir}
              filters={filters}
              onSort={handleSort}
              onFilter={handleFilter}
              onClose={() => setDialogColumn(null)}
            />
          )}
          <div className="transaction-body">
            {sortedTransactions.map((tx, index) => (
              <div key={index} className={`transaction-row ${tx.type.toLowerCase()}`}>
                <span>{formatCell(tx, columns[0])}</span>
                <span className={`tx-type ${tx.type.toLowerCase()}`}>{tx.type}</span>
                <span>{tx.description}</span>
                <span>{formatCell(tx, columns[3])}</span>
                <span>{formatCell(tx, columns[4])}</span>
                <span>{formatCell(tx, columns[5])}</span>
                <span>{formatCell(tx, columns[6])}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="transaction-summary">
          <div>
            <span>Total Billed</span>
            <strong>{formatCurrency(member.billedTotal)}</strong>
          </div>
          <div>
            <span>Total Collected</span>
            <strong>{formatCurrency(member.collectedTotal)}</strong>
          </div>
          <div>
            <span>Balance</span>
            <strong className={member.balance > 0 ? 'warn' : ''}>{formatCurrency(member.balance)}</strong>
          </div>
          <div>
            <span>Total Management</span>
            <strong>{formatCurrency(member.feesTotal)}</strong>
          </div>
          <div>
            <span>Net</span>
            <strong>{formatCurrency(member.hostTotal)}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}

const ScatterPlot = ({ members, xColumn, yColumn, onClose }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null)

  // Convert value to number (handles dates by converting to timestamps)
  const toNumeric = (value, column) => {
    if (value == null) return null
    if (column.type === 'date') {
      return value ? new Date(value).getTime() : null
    }
    return typeof value === 'number' ? value : null
  }

  // Filter out members with valid numeric values for both columns
  const validMembers = useMemo(() => {
    return members.filter(member => {
      const xVal = toNumeric(member[xColumn.key], xColumn)
      const yVal = toNumeric(member[yColumn.key], yColumn)
      return xVal != null && yVal != null && !isNaN(xVal) && !isNaN(yVal)
    })
  }, [members, xColumn, yColumn])

  // Calculate correlation coefficient
  const correlation = useMemo(() => {
    if (validMembers.length < 2) return 0

    const xValues = validMembers.map(m => toNumeric(m[xColumn.key], xColumn))
    const yValues = validMembers.map(m => toNumeric(m[yColumn.key], yColumn))

    const n = validMembers.length
    const sumX = xValues.reduce((a, b) => a + b, 0)
    const sumY = yValues.reduce((a, b) => a + b, 0)
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0)
    const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0)
    const sumY2 = yValues.reduce((sum, y) => sum + y * y, 0)

    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

    return denominator === 0 ? 0 : numerator / denominator
  }, [validMembers, xColumn, yColumn])

  // Calculate chart dimensions and scales
  const { xMin, xMax, yMin, yMax, xScale, yScale } = useMemo(() => {
    if (validMembers.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1, xScale: () => 0, yScale: () => 0 }
    }

    const xValues = validMembers.map(m => toNumeric(m[xColumn.key], xColumn))
    const yValues = validMembers.map(m => toNumeric(m[yColumn.key], yColumn))

    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    const yMin = Math.min(...yValues)
    const yMax = Math.max(...yValues)

    const xPadding = (xMax - xMin) * 0.1 || 1
    const yPadding = (yMax - yMin) * 0.1 || 1

    // Don't let axis go negative if all data is non-negative
    const xMinWithPadding = xMin >= 0 ? Math.max(0, xMin - xPadding) : xMin - xPadding
    const yMinWithPadding = yMin >= 0 ? Math.max(0, yMin - yPadding) : yMin - yPadding

    const chartWidth = 600
    const chartHeight = 400
    const margin = { top: 20, right: 20, bottom: 60, left: 80 }

    const xScale = (value) => {
      return margin.left + ((value - xMinWithPadding) / ((xMax + xPadding) - xMinWithPadding)) * (chartWidth - margin.left - margin.right)
    }

    const yScale = (value) => {
      return chartHeight - margin.bottom - ((value - yMinWithPadding) / ((yMax + yPadding) - yMinWithPadding)) * (chartHeight - margin.top - margin.bottom)
    }

    return { xMin: xMinWithPadding, xMax: xMax + xPadding, yMin: yMinWithPadding, yMax: yMax + yPadding, xScale, yScale }
  }, [validMembers, xColumn, yColumn])

  const formatValue = (value, column) => {
    if (column.type === 'date') return value ? new Date(value).toLocaleDateString('en-US') : '—'
    if (column.type === 'currency') return formatCurrency(value)
    if (column.type === 'percent') return `${formatNumber(value * 100)}%`
    return formatNumber(value)
  }

  const formatAxisValue = (value, column) => {
    if (column.type === 'date') {
      const date = new Date(value)
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().substring(2)}`
    }
    if (column.type === 'currency') return `$${Math.round(value)}`
    if (column.type === 'percent') return `${Math.round(value * 100)}%`
    return Math.round(value).toString()
  }

  const chartWidth = 600
  const chartHeight = 400
  const margin = { top: 20, right: 20, bottom: 60, left: 80 }

  return (
    <div className="transaction-overlay" onClick={onClose}>
      <div className="scatter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="transaction-header">
          <div>
            <h3>Scatter Plot</h3>
            <p>
              {xColumn.label} vs {yColumn.label} • Correlation: {correlation.toFixed(3)}
            </p>
          </div>
          <button type="button" className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="scatter-content">
          <svg width={chartWidth} height={chartHeight}>
            {/* Grid lines */}
            <g className="scatter-grid">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const x = margin.left + t * (chartWidth - margin.left - margin.right)
                const y = chartHeight - margin.bottom - t * (chartHeight - margin.top - margin.bottom)
                return (
                  <g key={t}>
                    <line
                      x1={x}
                      y1={margin.top}
                      x2={x}
                      y2={chartHeight - margin.bottom}
                      stroke="rgba(31, 27, 23, 0.08)"
                      strokeDasharray="4 6"
                    />
                    <line
                      x1={margin.left}
                      y1={y}
                      x2={chartWidth - margin.right}
                      y2={y}
                      stroke="rgba(31, 27, 23, 0.08)"
                      strokeDasharray="4 6"
                    />
                  </g>
                )
              })}
            </g>

            {/* X axis */}
            <g className="scatter-axis">
              <line
                x1={margin.left}
                y1={chartHeight - margin.bottom}
                x2={chartWidth - margin.right}
                y2={chartHeight - margin.bottom}
                stroke="rgba(31, 27, 23, 0.3)"
                strokeWidth="2"
              />
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const value = xMin + t * (xMax - xMin)
                const x = margin.left + t * (chartWidth - margin.left - margin.right)
                return (
                  <text
                    key={t}
                    x={x}
                    y={chartHeight - margin.bottom + 20}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize="0.7rem"
                  >
                    {formatAxisValue(value, xColumn)}
                  </text>
                )
              })}
              <text
                x={chartWidth / 2}
                y={chartHeight - 10}
                textAnchor="middle"
                fill="var(--ink)"
                fontSize="0.85rem"
                fontWeight="500"
              >
                {xColumn.label}
              </text>
            </g>

            {/* Y axis */}
            <g className="scatter-axis">
              <line
                x1={margin.left}
                y1={margin.top}
                x2={margin.left}
                y2={chartHeight - margin.bottom}
                stroke="rgba(31, 27, 23, 0.3)"
                strokeWidth="2"
              />
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const value = yMin + t * (yMax - yMin)
                const y = chartHeight - margin.bottom - t * (chartHeight - margin.top - margin.bottom)
                return (
                  <text
                    key={t}
                    x={margin.left - 10}
                    y={y}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    fill="var(--muted)"
                    fontSize="0.7rem"
                  >
                    {formatAxisValue(value, yColumn)}
                  </text>
                )
              })}
              <text
                x={-chartHeight / 2}
                y={20}
                textAnchor="middle"
                transform={`rotate(-90, 20, ${chartHeight / 2})`}
                fill="var(--ink)"
                fontSize="0.85rem"
                fontWeight="500"
              >
                {yColumn.label}
              </text>
            </g>

            {/* Data points */}
            <g className="scatter-points">
              {validMembers.map((member) => {
                const x = xScale(toNumeric(member[xColumn.key], xColumn))
                const y = yScale(toNumeric(member[yColumn.key], yColumn))
                const isHovered = hoveredPoint === member.memberId
                return (
                  <circle
                    key={member.memberId}
                    cx={x}
                    cy={y}
                    r={isHovered ? 8 : 5}
                    fill={isHovered ? 'var(--terra)' : 'var(--blue)'}
                    opacity={isHovered ? 1 : 0.6}
                    onMouseEnter={() => setHoveredPoint(member.memberId)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                  />
                )
              })}
            </g>
          </svg>

          {/* Tooltip */}
          {hoveredPoint && validMembers.find(m => m.memberId === hoveredPoint) && (
            <div className="scatter-tooltip">
              {(() => {
                const member = validMembers.find(m => m.memberId === hoveredPoint)
                return (
                  <>
                    <strong>{member.name || `Member ${member.memberId}`}</strong>
                    <div>{xColumn.label}: {formatValue(member[xColumn.key], xColumn)}</div>
                    <div>{yColumn.label}: {formatValue(member[yColumn.key], yColumn)}</div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ColumnDialog = ({ column, members, position, sortKey, sortDir, filters, onSort, onFilter, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('')

  const uniqueValues = useMemo(() => {
    const values = new Set()
    members.forEach((member) => {
      const value = member[column.key]
      if (value !== undefined && value !== null && value !== '') {
        if (column.type === 'date') {
          values.add(value ? new Date(value).toLocaleDateString('en-US') : '—')
        } else if (column.type === 'status') {
          values.add(value || 'Past')
        } else if (column.type === 'currency' || column.type === 'percent' || column.type === 'number') {
          return
        } else {
          values.add(String(value))
        }
      }
    })
    return Array.from(values).sort()
  }, [members, column])

  const showFilters = uniqueValues.length > 0 && uniqueValues.length <= 10
  const showSearch = column.type === 'text' && uniqueValues.length > 10

  const filteredUniqueValues = useMemo(() => {
    if (!searchQuery.trim()) return uniqueValues
    const normalized = searchQuery.trim().toLowerCase()
    return uniqueValues.filter(value => value.toLowerCase().includes(normalized))
  }, [uniqueValues, searchQuery])

  const currentFilters = filters[column.key] || null

  const handleToggleValue = (value) => {
    const current = currentFilters ? new Set(currentFilters) : new Set(uniqueValues)
    if (current.has(value)) {
      current.delete(value)
    } else {
      current.add(value)
    }
    onFilter(column.key, current.size === uniqueValues.length ? null : current)
  }

  return (
    <>
      <div className="column-dialog-overlay" onClick={onClose} />
      <div
        className="column-dialog"
        style={{ top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="column-dialog-section">
          <button
            type="button"
            className={`column-dialog-btn ${sortKey === column.key && sortDir === 'asc' ? 'active' : ''}`}
            onClick={() => { onSort(column.key, 'asc'); onClose() }}
          >
            ↑ Sort A to Z
          </button>
          <button
            type="button"
            className={`column-dialog-btn ${sortKey === column.key && sortDir === 'desc' ? 'active' : ''}`}
            onClick={() => { onSort(column.key, 'desc'); onClose() }}
          >
            ↓ Sort Z to A
          </button>
        </div>
        {showSearch && (
          <div className="column-dialog-section">
            <div className="column-dialog-title">Search</div>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${column.label}...`}
              className="column-search-input"
              autoFocus
            />
          </div>
        )}
        {(showFilters || showSearch) && (
          <div className="column-dialog-section">
            <div className="column-dialog-title">Filter</div>
            <div className="filter-scroll">
              {filteredUniqueValues.map((value) => {
                const isChecked = !currentFilters || currentFilters.has(value)
                return (
                  <button
                    key={value}
                    type="button"
                    className="filter-option"
                    onClick={() => handleToggleValue(value)}
                  >
                    <span className={`filter-checkbox ${isChecked ? 'checked' : ''}`} />
                    <span className="filter-label">{value}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const MemberTable = ({ members, billedRows, collectedRows }) => {
  const [sortKey, setSortKey] = useState('collectedTotal')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedMember, setSelectedMember] = useState(null)
  const [dialogColumn, setDialogColumn] = useState(null)
  const [dialogPosition, setDialogPosition] = useState({ top: 0, left: 0 })
  const [filters, setFilters] = useState({})
  const [scatterMode, setScatterMode] = useState(false)
  const [scatterColumns, setScatterColumns] = useState([])
  const [showScatterPlot, setShowScatterPlot] = useState(false)

  const columns = useMemo(() => [
    { key: 'name', label: 'Member', type: 'text' },
    { key: 'moveIn', label: 'Move in', type: 'date' },
    { key: 'moveOut', label: 'Move out', type: 'date' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'lengthOfStay', label: 'Length (days)', type: 'number' },
    { key: 'billedTotal', label: 'Billed', type: 'currency' },
    { key: 'collectedTotal', label: 'Collected', type: 'currency' },
    { key: 'balance', label: 'Balance', type: 'currency' },
    { key: 'hostPercent', label: '% To Host', type: 'percent' },
    { key: 'feePercent', label: '% From Fees', type: 'percent' },
    { key: 'monthlyRent', label: 'Monthly Rent', type: 'currency' },
    { key: 'balanceGrowthRate', label: 'Balance Growth Rate', type: 'currency' },
  ], [])

  const handleHeaderClick = (column, event) => {
    if (scatterMode) {
      // In scatter mode, select columns for scatter plot
      // Allow numeric types and dates (dates will be converted to timestamps)
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent' || column.type === 'date') {
        if (scatterColumns.length < 2) {
          const newColumns = [...scatterColumns, column]
          setScatterColumns(newColumns)
          if (newColumns.length === 2) {
            setShowScatterPlot(true)
            setScatterMode(false)
          }
        }
      }
    } else {
      // Normal mode: show sort/filter dialog
      const rect = event.currentTarget.getBoundingClientRect()
      setDialogPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.left),
      })
      setDialogColumn(column)
    }
  }

  const handleScatterButtonClick = () => {
    setScatterMode(true)
    setScatterColumns([])
  }

  const handleCancelScatter = () => {
    setScatterMode(false)
    setScatterColumns([])
  }

  const handleCloseScatterPlot = () => {
    setShowScatterPlot(false)
    setScatterColumns([])
  }

  const handleSort = (key, dir) => {
    setSortKey(key)
    setSortDir(dir)
  }

  const handleFilter = (key, values) => {
    setFilters((prev) => {
      const next = { ...prev }
      if (values === null) {
        delete next[key]
      } else {
        next[key] = values
      }
      return next
    })
  }

  const filteredMembers = useMemo(() => {
    let result = members

    const filterKeys = Object.keys(filters)
    if (filterKeys.length > 0) {
      result = result.filter((member) => {
        return filterKeys.every((key) => {
          const allowedValues = filters[key]
          if (!allowedValues || allowedValues.size === 0) return false
          const column = columns.find((c) => c.key === key)
          let memberValue = member[key]
          if (column?.type === 'date') {
            memberValue = memberValue ? new Date(memberValue).toLocaleDateString('en-US') : '—'
          } else if (column?.type === 'status') {
            memberValue = memberValue || 'Past'
          } else {
            memberValue = String(memberValue)
          }
          return allowedValues.has(memberValue)
        })
      })
    }

    return result
  }, [members, filters, columns])

  const sortedMembers = useMemo(() => {
    const sorted = [...filteredMembers]
    const multiplier = sortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (sortKey === 'moveIn' || sortKey === 'moveOut') {
        const aTime = aVal ? new Date(aVal).getTime() : 0
        const bTime = bVal ? new Date(bVal).getTime() : 0
        return (aTime - bTime) * multiplier
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * multiplier
      }

      return String(aVal).localeCompare(String(bVal)) * multiplier
    })
    return sorted
  }, [filteredMembers, sortDir, sortKey])

  const formatCell = (member, column) => {
    const value = member[column.key]
    switch (column.type) {
      case 'currency':
        return formatCurrency(value)
      case 'percent':
        return `${formatNumber(value * 100)}%`
      case 'date':
        return value ? new Date(value).toLocaleDateString('en-US') : '—'
      case 'number':
        return formatNumber(value)
      case 'status':
        return value || 'Past'
      default:
        return value || '—'
    }
  }

  return (
    <div className="panel member-table-panel">
      <div className="member-table">
        <div className="table-head sticky">
          {columns.map((column) => {
            const isSelected = scatterColumns.some(col => col.key === column.key)
            const isSelectable = scatterMode && (column.type === 'number' || column.type === 'currency' || column.type === 'percent' || column.type === 'date')
            return (
              <button
                key={column.key}
                type="button"
                className={`table-sort ${sortKey === column.key ? 'active' : ''}${filters[column.key] ? ' filtered' : ''}${isSelected ? ' scatter-selected' : ''}${isSelectable ? ' scatter-selectable' : ''}`}
                onClick={(e) => handleHeaderClick(column, e)}
              >
                <em>{sortKey === column.key ? (sortDir === 'asc' ? '↑ ' : '↓ ') : ''}</em>
                <span>{column.label}</span>
                {filters[column.key] && <span className="filter-indicator">●</span>}
              </button>
            )
          })}
        </div>
        {dialogColumn && (
          <ColumnDialog
            column={dialogColumn}
            members={members}
            position={dialogPosition}
            sortKey={sortKey}
            sortDir={sortDir}
            filters={filters}
            onSort={handleSort}
            onFilter={handleFilter}
            onClose={() => setDialogColumn(null)}
          />
        )}
        <div className="table-body">
          {sortedMembers.map((member) => (
            <div
              key={member.memberId}
              className="table-row clickable"
              onClick={() => setSelectedMember(member)}
            >
              {columns.map((column) => (
                <span key={column.key} className={`cell ${column.key}`}>
                  {column.key === 'name' ? (
                    <>
                      {member.name || `Member ${member.memberId}`}
                      <small>
                        {member.street1} - {member.roomNumber}
                      </small>
                    </>
                  ) : (
                    formatCell(member, column)
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="table-floating-controls">
        {scatterMode ? (
          <div className="scatter-mode-banner">
            <span>
              Select {scatterColumns.length === 0 ? 'first' : 'second'} column for scatter plot
              {scatterColumns.length > 0 && ` (X-axis: ${scatterColumns[0].label})`}
            </span>
            <button type="button" onClick={handleCancelScatter} className="cancel-scatter-btn">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={handleScatterButtonClick} className="scatter-button">
            Scatter
          </button>
        )}
      </div>
      {selectedMember && (
        <TransactionTable
          member={selectedMember}
          billedRows={billedRows}
          collectedRows={collectedRows}
          onClose={() => setSelectedMember(null)}
        />
      )}
      {showScatterPlot && scatterColumns.length === 2 && (
        <ScatterPlot
          members={sortedMembers}
          xColumn={scatterColumns[0]}
          yColumn={scatterColumns[1]}
          onClose={handleCloseScatterPlot}
        />
      )}
    </div>
  )
}

function App() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summaryRows, setSummaryRows] = useState([])
  const [billedRows, setBilledRows] = useState([])
  const [collectedRows, setCollectedRows] = useState([])
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [summary, billed, collected] = await Promise.all([
          fetch('/summary.csv').then((res) => res.text()),
          fetch('/billed.csv').then((res) => res.text()),
          fetch('/collected.csv').then((res) => res.text()),
        ])

        if (!active) return
        setSummaryRows(parseCSV(summary))
        setBilledRows(parseCSV(billed))
        setCollectedRows(parseCSV(collected))
        setLoading(false)
      } catch (err) {
        if (!active) return
        setError('Unable to load CSV files. Check that /summary.csv, /billed.csv, and /collected.csv are available.')
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  const derived = useMemo(() => {
    if (!summaryRows.length || !billedRows.length || !collectedRows.length) {
      return null
    }

    const summaryByMonth = summaryRows
      .map((row) => ({
        month: row['Earnings Month'],
        gross: toNumber(row['Gross Collected']),
        host: toNumber(row['Host Earnings']),
        fees: Math.abs(toNumber(row['Service Fees'])) + Math.abs(toNumber(row['Transaction Fee'])),
      }))
      .filter((row) => row.month)
      .sort((a, b) => a.month.localeCompare(b.month))

    const totals = summaryByMonth.reduce(
      (acc, row) => {
        acc.gross += row.gross
        acc.host += row.host
        acc.fees += row.fees
        return acc
      },
      { gross: 0, host: 0, fees: 0 }
    )

    const monthlyGrossValues = summaryByMonth.map((row) => row.gross)
    const monthlyHostValues = summaryByMonth.map((row) => row.host)

    const summaryByProperty = summaryRows
      .map((row) => ({
        month: row['Earnings Month'],
        propertyId: row['PSID'] || row['Property ID'] || '',
        address: row['Address'] || row['Street 1'] || '',
        gross: toNumber(row['Gross Collected']),
        host: toNumber(row['Host Earnings']),
      }))
      .filter((row) => row.month)

    const monthSet = new Set(summaryByProperty.map((row) => row.month))
    const months = Array.from(monthSet).sort((a, b) => a.localeCompare(b))

    const propertyMap = new Map()
    summaryByProperty.forEach((row) => {
      const key = row.propertyId || row.address || 'Unknown'
      const label = row.address || `Property ${row.propertyId}` || 'Unknown'
      const existing = propertyMap.get(key) || {
        key,
        label,
        grossByMonth: new Map(),
        hostByMonth: new Map(),
      }
      existing.grossByMonth.set(
        row.month,
        (existing.grossByMonth.get(row.month) ?? 0) + row.gross
      )
      existing.hostByMonth.set(
        row.month,
        (existing.hostByMonth.get(row.month) ?? 0) + row.host
      )
      propertyMap.set(key, existing)
    })

    const hostTotalsByMonth = new Map()
    summaryByProperty.forEach((row) => {
      hostTotalsByMonth.set(
        row.month,
        (hostTotalsByMonth.get(row.month) ?? 0) + row.host
      )
    })

    const propertySeries = Array.from(propertyMap.values())
      .map((property, index) => ({
        key: property.key,
        label: property.label,
        color: areaColors[index % areaColors.length],
        grossValues: months.map((month) => property.grossByMonth.get(month) ?? 0),
        hostValues: months.map((month) => property.hostByMonth.get(month) ?? 0),
      }))
      .sort(
        (a, b) =>
          b.grossValues.reduce((sum, val) => sum + val, 0) -
          a.grossValues.reduce((sum, val) => sum + val, 0)
      )

    const memberMap = new Map()
    const roomMonthTotals = new Map()
    const propertyMonthTotals = new Map()

    const updateMember = (row, updater) => {
      const memberId = row['Member ID'] || 'unknown'
      const member = memberMap.get(memberId) || {
        memberId,
        name: `${row['Member First Name'] || ''} ${row['Member Last Name'] || ''}`.trim(),
        market: row['PadSplit Market'] || '',
        roomId: row['Room ID'] || '',
        street1: row['Street 1'] || '',
        roomNumber: row['Room Number'] || '',
        propertyId: row['Property ID'] || '',
        billedTotal: 0,
        collectedTotal: 0,
        hostTotal: 0,
        feesTotal: 0,
        lateFees: 0,
        billCount: 0,
        lateBillCount: 0,
        minDate: null,
        maxDate: null,
        memberMonthTotals: new Map(),
        transactionsByDate: [],
        lastBilledDate: null,
      }
      updater(member)
      memberMap.set(memberId, member)
    }

    let latestBillDate = null
    billedRows.forEach((row) => {
      const amount = -toNumber(row['Amount'])
      const date = row['Created']
      updateMember(row, (member) => {
        member.billedTotal += amount
        member.billCount += 1
        const currentDate = date ? new Date(date) : null
        if (currentDate) {
          if (!latestBillDate || currentDate > latestBillDate) {
            latestBillDate = currentDate
          }
          member.minDate = member.minDate ? new Date(Math.min(member.minDate, currentDate)) : currentDate
          member.maxDate = member.maxDate ? new Date(Math.max(member.maxDate, currentDate)) : currentDate
          member.lastBilledDate = member.lastBilledDate
            ? new Date(Math.max(member.lastBilledDate, currentDate))
            : currentDate
          member.transactionsByDate.push({ date: currentDate, billed: amount, collected: 0 })
        }
      })
    })

    collectedRows.forEach((row) => {
      const gross = toNumber(row['Gross Collected'] ?? row['Gross Collected '])
      const host = toNumber(row['Host Earnings'])
      const fees = Math.abs(toNumber(row['Total Fees']))
      const billType = row['Bill Type']
      const date = row['Created']
      const monthKey = getMonthKey(row['Payout Month'] || row['Created'])
      const roomId = row['Room ID'] || ''
      const propertyId = row['Property ID'] || ''

      if (monthKey && roomId) {
        const roomKey = `${propertyId}-${monthKey}-${roomId}`
        roomMonthTotals.set(roomKey, (roomMonthTotals.get(roomKey) ?? 0) + gross)
      }

      updateMember(row, (member) => {
        member.collectedTotal += gross
        member.hostTotal += host
        member.feesTotal += fees
        member.billCount += 1
        if (billType === 'Late Fees') {
          member.lateFees += gross
          member.lateBillCount += 1
        }
        const currentDate = date ? new Date(date) : null
        if (currentDate) {
          member.minDate = member.minDate ? new Date(Math.min(member.minDate, currentDate)) : currentDate
          member.maxDate = member.maxDate ? new Date(Math.max(member.maxDate, currentDate)) : currentDate
          member.transactionsByDate.push({ date: currentDate, billed: 0, collected: gross })
        }
        if (monthKey) {
          const current = member.memberMonthTotals.get(monthKey) ?? 0
          member.memberMonthTotals.set(monthKey, current + gross)
        }
      })
    })

    roomMonthTotals.forEach((value, key) => {
      const [propertyId, monthKey] = key.split('-')
      const propertyKey = `${propertyId}-${monthKey}`
      const current = propertyMonthTotals.get(propertyKey) || { sum: 0, count: 0 }
      propertyMonthTotals.set(propertyKey, {
        sum: current.sum + value,
        count: current.count + 1,
      })
    })

    const members = Array.from(memberMap.values()).map((member) => {
      const lengthOfStay =
        member.minDate && member.maxDate
          ? Math.max(1, Math.round((member.maxDate - member.minDate) / (1000 * 60 * 60 * 24)))
          : 0

      let vsAvgTotal = 0
      let vsAvgCount = 0
      member.memberMonthTotals.forEach((value, monthKey) => {
        const propertyKey = `${member.propertyId}-${monthKey}`
        const propertyAvg = propertyMonthTotals.get(propertyKey)
        if (propertyAvg && propertyAvg.count > 0) {
          const avg = propertyAvg.sum / propertyAvg.count
          vsAvgTotal += value - avg
          vsAvgCount += 1
        }
      })

      const balance = member.billedTotal - member.collectedTotal
      const collectedPerDay = lengthOfStay ? member.collectedTotal / lengthOfStay : 0
      const monthlyRent = collectedPerDay * (365 / 12)
      const hostPercent = member.collectedTotal ? member.hostTotal / member.collectedTotal : 0
      const feePercent = member.collectedTotal ? member.lateFees / member.collectedTotal : 0

      const sortedTransactions = member.transactionsByDate.sort((a, b) => a.date - b.date)
      let runningBalance = 0
      let balance30DaysAgo = 0
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      sortedTransactions.forEach((tx) => {
        runningBalance += tx.billed - tx.collected
        if (tx.date <= thirtyDaysAgo) {
          balance30DaysAgo = runningBalance
        }
      })

      const balanceGrowthRate = balance - balance30DaysAgo

      return {
        ...member,
        lengthOfStay,
        balance,
        lateFeeRate: member.billCount ? member.lateBillCount / member.billCount : 0,
        vsAvg: vsAvgCount ? vsAvgTotal / vsAvgCount : 0,
        moveIn: member.minDate ? member.minDate.toISOString() : '',
        moveOut: member.maxDate ? member.maxDate.toISOString() : '',
        status: getMemberStatus(member.lastBilledDate, latestBillDate),
        collectedPerDay,
        monthlyRent,
        hostPercent,
        feePercent,
        balanceGrowthRate,
        collectionRate: member.billedTotal
          ? member.collectedTotal / member.billedTotal
          : 0,
      }
    })

    const topMembers = [...members]
      .sort((a, b) => b.collectedTotal - a.collectedTotal)
      .slice(0, 6)

    const topBalances = [...members]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 8)

    const memberBarItems = [...members]
      .sort((a, b) => b.hostTotal - a.hostTotal)
      .slice(0, 6)
      .map((member) => ({
        label: member.name || `Member ${member.memberId}`,
        value: member.hostTotal,
      }))

    const maxBarValue = Math.max(...memberBarItems.map((item) => item.value), 0)

    return {
      summaryByMonth,
      totals,
      monthlyGrossValues,
      monthlyHostValues,
      members,
      topMembers,
      topBalances,
      memberBarItems,
      maxBarValue,
      months,
      propertySeries,
      ownerNetByMonth: months.map((month) => hostTotalsByMonth.get(month) ?? 0),
    }
  }, [summaryRows, billedRows, collectedRows])

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  if (!derived) {
    return <div className="error">No data loaded.</div>
  }

  return (
    <div className="dashboard">
      <nav className="tab-nav">
        <button
          type="button"
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          Members
        </button>
      </nav>

      {activeTab === 'overview' && (
        <header className="hero">
          <div>
            <p className="eyebrow">PadSplit Member Intelligence</p>
            <h1>Revenue clarity, member by member.</h1>
            <p className="subtitle">
              A visual command center for billed vs collected, length of stay,
              and member-level performance snapshots.
            </p>
          </div>
          <div className="hero-panel">
            <div className="hero-stats">
              <div>
                <span>Total Collected</span>
                <strong>{formatCurrency(derived.totals.gross)}</strong>
                <p>All properties combined.</p>
              </div>
              <div>
                <span>Owner Net</span>
                <strong>{formatCurrency(derived.totals.host)}</strong>
                <p>After platform fees.</p>
              </div>
              <div>
                <span>Collection Rate</span>
                <strong>
                  {formatNumber(
                    derived.totals.gross ? (derived.totals.host / derived.totals.gross) * 100 : 0
                  )}
                  %
                </strong>
                <p>Net vs total collected.</p>
              </div>
            </div>
            <StackedAreaChart
              series={derived.propertySeries.map((property) => ({
                key: property.key,
                label: property.label,
                color: property.color,
                values: property.grossValues,
              }))}
              months={derived.months}
              lineValues={derived.ownerNetByMonth}
              lineLabel="Owner net (all properties)"
            />
          </div>
        </header>
      )}

      {activeTab === 'members' && (
        <MemberTable
          members={derived.members}
          billedRows={billedRows}
          collectedRows={collectedRows}
        />
      )}
    </div>
  )
}

export default App
