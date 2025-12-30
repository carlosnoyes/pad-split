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

const TransactionTable = ({ member, billedRows, collectedRows, onClose }) => {
  const transactions = useMemo(() => {
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
    return [...billed, ...collected].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0
      const bTime = b.date ? new Date(b.date).getTime() : 0
      return bTime - aTime
    })
  }, [member.memberId, billedRows, collectedRows])

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
            <span>Date</span>
            <span>Type</span>
            <span>Description</span>
            <span>Billed</span>
            <span>Collected</span>
            <span>Management</span>
            <span>Net</span>
          </div>
          <div className="transaction-body">
            {transactions.map((tx, index) => (
              <div key={index} className={`transaction-row ${tx.type.toLowerCase()}`}>
                <span>{tx.date ? new Date(tx.date).toLocaleDateString('en-US') : '—'}</span>
                <span className={`tx-type ${tx.type.toLowerCase()}`}>{tx.type}</span>
                <span>{tx.description}</span>
                <span>{tx.amount !== null ? formatCurrency(tx.amount) : '—'}</span>
                <span>{tx.gross !== null ? formatCurrency(tx.gross) : '—'}</span>
                <span>{tx.fees !== null ? formatCurrency(tx.fees) : '—'}</span>
                <span>{tx.host !== null ? formatCurrency(tx.host) : '—'}</span>
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

const MemberTable = ({ members, billedRows, collectedRows }) => {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('collectedTotal')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedMember, setSelectedMember] = useState(null)

  const columns = [
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
  ]

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return members
    return members.filter((member) => {
      const haystack = [
        member.name,
        member.memberId,
        member.market,
        member.roomId,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [members, query])

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

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'name' ? 'asc' : 'desc')
  }

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
      <div className="panel-header table-header">
        <div>
          <h2>Member KPI table</h2>
          <p>Search, sort, and compare every renter in one place.</p>
        </div>
        <div className="table-controls">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search member, room, market..."
            aria-label="Search members"
          />
          <span>{formatNumber(sortedMembers.length)} members</span>
        </div>
      </div>
      <div className="member-table">
        <div className="table-head sticky">
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              className={`table-sort ${sortKey === column.key ? 'active' : ''}`}
              onClick={() => toggleSort(column.key)}
            >
              <em>{sortKey === column.key ? (sortDir === 'asc' ? '↑ ' : '↓ ') : ''}</em>
              <span>{column.label}</span>
            </button>
          ))}
        </div>
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
      {selectedMember && (
        <TransactionTable
          member={selectedMember}
          billedRows={billedRows}
          collectedRows={collectedRows}
          onClose={() => setSelectedMember(null)}
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
