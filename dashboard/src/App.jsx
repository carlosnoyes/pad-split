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

const monthLabel = (month) => {
  if (!month) return ''
  const [year, mon] = month.split('-')
  const date = new Date(Number(year), Number(mon) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

const getMonthKey = (dateText) => (dateText ? dateText.slice(0, 7) : '')

const Sparkline = ({ values }) => {
  if (!values || values.length === 0) return null
  const height = 48
  const width = 180
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  })

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points.join(' ')} />
    </svg>
  )
}

const BarList = ({ items, maxValue }) => (
  <div className="bar-list">
    {items.map((item) => {
      const width = maxValue ? (item.value / maxValue) * 100 : 0
      return (
        <div key={item.label} className="bar-row">
          <div className="bar-meta">
            <span>{item.label}</span>
            <strong>{formatCurrency(item.value)}</strong>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${width}%` }} />
          </div>
        </div>
      )
    })}
  </div>
)

const MemberCard = ({ member }) => (
  <article className="member-card">
    <header>
      <div>
        <p className="member-name">
          {member.name}
          <span>#{member.memberId}</span>
        </p>
        <p className="member-sub">
          Room {member.roomId} - {member.market}
        </p>
      </div>
      <div className="badge">
        {member.balance >= 0 ? 'Outstanding' : 'Credit'}
      </div>
    </header>
    <div className="member-metrics">
      <div>
        <span>Total Collected</span>
        <strong>{formatCurrency(member.collectedTotal)}</strong>
      </div>
      <div>
        <span>Total Billed</span>
        <strong>{formatCurrency(member.billedTotal)}</strong>
      </div>
      <div>
        <span>Length of Stay</span>
        <strong>{formatNumber(member.lengthOfStay)} days</strong>
      </div>
      <div>
        <span>Net to Host</span>
        <strong>{formatCurrency(member.hostTotal)}</strong>
      </div>
    </div>
    <div className="member-footer">
      <div>
        <span>Balance</span>
        <strong className={member.balance >= 0 ? 'warn' : 'good'}>
          {formatCurrency(Math.abs(member.balance))}
        </strong>
      </div>
      <div>
        <span>Vs property avg</span>
        <strong className={member.vsAvg >= 0 ? 'good' : 'warn'}>
          {member.vsAvg >= 0 ? '+' : '-'}
          {formatCurrency(Math.abs(member.vsAvg))}
        </strong>
      </div>
      <div>
        <span>Late fee rate</span>
        <strong>{formatNumber(member.lateFeeRate * 100)}%</strong>
      </div>
    </div>
  </article>
)

function App() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summaryRows, setSummaryRows] = useState([])
  const [billedRows, setBilledRows] = useState([])
  const [collectedRows, setCollectedRows] = useState([])

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
      }
      updater(member)
      memberMap.set(memberId, member)
    }

    billedRows.forEach((row) => {
      const amount = Math.abs(toNumber(row['Amount']))
      const date = row['Created']
      updateMember(row, (member) => {
        member.billedTotal += amount
        member.billCount += 1
        const currentDate = date ? new Date(date) : null
        if (currentDate) {
          member.minDate = member.minDate ? new Date(Math.min(member.minDate, currentDate)) : currentDate
          member.maxDate = member.maxDate ? new Date(Math.max(member.maxDate, currentDate)) : currentDate
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

      return {
        ...member,
        lengthOfStay,
        balance: member.billedTotal - member.collectedTotal,
        lateFeeRate: member.billCount ? member.lateBillCount / member.billCount : 0,
        vsAvg: vsAvgCount ? vsAvgTotal / vsAvgCount : 0,
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
          <div>
            <span>Total Gross Collected</span>
            <strong>{formatCurrency(derived.totals.gross)}</strong>
            <Sparkline values={derived.monthlyGrossValues} />
          </div>
          <div>
            <span>Net Host Earnings</span>
            <strong>{formatCurrency(derived.totals.host)}</strong>
            <Sparkline values={derived.monthlyHostValues} />
          </div>
          <div>
            <span>Collection Rate</span>
            <strong>
              {formatNumber(
                derived.totals.gross ? (derived.totals.host / derived.totals.gross) * 100 : 0
              )}
              %
            </strong>
            <p>Net vs gross across summary months.</p>
          </div>
        </div>
      </header>

      <section className="grid kpi-grid">
        <div className="kpi-card">
          <p>Gross Collected</p>
          <strong>{formatCurrency(derived.totals.gross)}</strong>
          <span>{derived.summaryByMonth.length} months</span>
        </div>
        <div className="kpi-card">
          <p>Total Fees</p>
          <strong>{formatCurrency(derived.totals.fees)}</strong>
          <span>Service + transaction fees</span>
        </div>
        <div className="kpi-card">
          <p>Avg Monthly Gross</p>
          <strong>
            {formatCurrency(
              derived.summaryByMonth.length
                ? derived.totals.gross / derived.summaryByMonth.length
                : 0
            )}
          </strong>
          <span>From summary.csv</span>
        </div>
        <div className="kpi-card">
          <p>Active Members</p>
          <strong>{formatNumber(derived.members.length)}</strong>
          <span>With billed or collected activity</span>
        </div>
      </section>

      <section className="grid main-grid">
        <div className="panel wide">
          <div className="panel-header">
            <h2>Monthly revenue trend</h2>
            <p>Gross vs net host earnings from summary.csv.</p>
          </div>
          <div className="trend-chart">
            {derived.summaryByMonth.map((row) => {
              const ratio = derived.totals.gross ? row.gross / derived.totals.gross : 0
              return (
                <div key={row.month} className="trend-row">
                  <div>
                    <span>{monthLabel(row.month)}</span>
                    <strong>{formatCurrency(row.gross)}</strong>
                  </div>
                  <div className="trend-bars">
                    <div className="trend-bar gross" style={{ width: `${ratio * 100}%` }} />
                    <div
                      className="trend-bar host"
                      style={{
                        width: `${row.gross ? (row.host / row.gross) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <em>{formatCurrency(row.host)} net</em>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Top member earnings</h2>
            <p>Net host earnings leaders.</p>
          </div>
          <BarList items={derived.memberBarItems} maxValue={derived.maxBarValue} />
        </div>
      </section>

      <section className="grid member-grid">
        {derived.topMembers.map((member) => (
          <MemberCard key={member.memberId} member={member} />
        ))}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Balances to watch</h2>
          <p>Members with the largest outstanding balances.</p>
        </div>
        <div className="table">
          <div className="table-head">
            <span>Member</span>
            <span>Balance</span>
            <span>Collected</span>
            <span>Length of stay</span>
          </div>
          {derived.topBalances.map((member) => (
            <div key={member.memberId} className="table-row">
              <span>
                {member.name || `Member ${member.memberId}`}
                <small>Room {member.roomId}</small>
              </span>
              <span className={member.balance >= 0 ? 'warn' : 'good'}>
                {formatCurrency(member.balance)}
              </span>
              <span>{formatCurrency(member.collectedTotal)}</span>
              <span>{formatNumber(member.lengthOfStay)} days</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
