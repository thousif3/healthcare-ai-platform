'use client';

import { useEffect, useState, useCallback } from 'react';

/* ─── Types ────────────────────────────────────────────────────────────── */
interface Appointment {
    appointment_id: string;
    patient_id: string;
    patient_name?: string;
    appointment_date: string;
    appointment_type?: string;
    no_show_probability?: number | null;
    status?: string;
}

type SortKey = keyof Appointment | 'risk';

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function riskLabel(prob: number | null | undefined) {
    if (prob == null) return { label: 'Unknown', color: '#64748b', bg: 'rgba(100,116,139,0.12)' };
    if (prob > 0.7) return { label: 'High Flight Risk', color: '#ef4444', bg: 'rgba(239,68,68,0.14)' };
    if (prob > 0.4) return { label: 'Moderate Risk', color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' };
    return { label: 'Low Risk', color: '#10b981', bg: 'rgba(16,185,129,0.14)' };
}

function RiskBadge({ prob }: { prob: number | null | undefined }) {
    const { label, color, bg } = riskLabel(prob);
    const isHigh = prob != null && prob > 0.7;
    return (
        <span
            className={isHigh ? 'pulse-risk' : ''}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                color,
                background: bg,
                border: `1px solid ${color}55`,
                whiteSpace: 'nowrap',
            }}
        >
            <span
                style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: color,
                    boxShadow: isHigh ? `0 0 6px ${color}` : 'none',
                    flexShrink: 0,
                }}
            />
            {label}
        </span>
    );
}

function ProbBar({ prob }: { prob: number | null | undefined }) {
    if (prob == null) return <span style={{ color: '#475569', fontSize: '0.8rem' }}>—</span>;
    const pct = Math.round(prob * 100);
    const { color } = riskLabel(prob);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
                style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background: '#2a2f45',
                    overflow: 'hidden',
                    minWidth: 60,
                }}
            >
                <div
                    style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${color}88, ${color})`,
                        borderRadius: 3,
                        transition: 'width 0.6s ease',
                    }}
                />
            </div>
            <span style={{ fontSize: '0.78rem', color, fontWeight: 600, minWidth: 34, textAlign: 'right' }}>
                {pct}%
            </span>
        </div>
    );
}

/* ─── Main Component ────────────────────────────────────────────────────── */
export default function Dashboard() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'high' | 'moderate' | 'low'>('all');
    const [sortKey, setSortKey] = useState<SortKey>('appointment_date');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const fetchAppointments = useCallback(async () => {
        try {
            const res = await fetch('/api/appointments');
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const data: any = await res.json();
            console.log("Backend API Response:", data);

            // Safely extract the array no matter how the backend wrapped it:
            if (Array.isArray(data)) {
                setAppointments(data);
            } else if (data && Array.isArray(data.appointments)) {
                setAppointments(data.appointments);
            } else if (data && Array.isArray(data.data)) {
                setAppointments(data.data);
            } else {
                // If it's an error message or unexpected object, default to empty to prevent crash
                setAppointments([]);
            }
            setLastUpdated(new Date());
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAppointments();
        const iv = setInterval(fetchAppointments, 30_000);
        return () => clearInterval(iv);
    }, [fetchAppointments]);

    /* ── Derived data ── */
    const stats = {
        total: appointments.length,
        high: appointments.filter(a => (a.no_show_probability ?? 0) > 0.7).length,
        moderate: appointments.filter(a => { const p = a.no_show_probability ?? 0; return p > 0.4 && p <= 0.7; }).length,
        low: appointments.filter(a => (a.no_show_probability ?? 1) <= 0.4).length,
    };

    const visible = appointments
        .filter(a => {
            if (search) {
                const q = search.toLowerCase();
                return (
                    (a.patient_name ?? '').toLowerCase().includes(q) ||
                    (a.patient_id ?? '').toLowerCase().includes(q) ||
                    (a.appointment_id ?? '').toLowerCase().includes(q)
                );
            }
            return true;
        })
        .filter(a => {
            const p = a.no_show_probability;
            if (filter === 'high') return p != null && p > 0.7;
            if (filter === 'moderate') return p != null && p > 0.4 && p <= 0.7;
            if (filter === 'low') return p == null || p <= 0.4;
            return true;
        })
        .sort((a, b) => {
            let av: string | number = 0, bv: string | number = 0;
            if (sortKey === 'no_show_probability' || sortKey === 'risk') {
                av = a.no_show_probability ?? -1;
                bv = b.no_show_probability ?? -1;
            } else if (sortKey === 'appointment_date') {
                av = new Date(a.appointment_date).getTime();
                bv = new Date(b.appointment_date).getTime();
            } else {
                av = (a[sortKey as keyof Appointment] as string) ?? '';
                bv = (b[sortKey as keyof Appointment] as string) ?? '';
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

    function toggleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    }

    function SortIcon({ col }: { col: SortKey }) {
        if (sortKey !== col) return <span style={{ opacity: 0.3 }}>↕</span>;
        return <span style={{ color: '#3b82f6' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
    }

    /* ── Styles ── */
    const card: React.CSSProperties = {
        background: '#1e2130',
        border: '1px solid #2a2f45',
        borderRadius: 12,
        padding: '1.25rem 1.5rem',
    };

    const thStyle: React.CSSProperties = {
        padding: '0.75rem 1rem',
        textAlign: 'left',
        fontSize: '0.72rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#64748b',
        borderBottom: '1px solid #2a2f45',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
    };

    /* ── Render ── */
    return (
        <div className="fade-in" style={{ maxWidth: 1400, margin: '0 auto' }}>

            {/* ── Header row ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#e2e8f0' }}>
                        Appointment Monitor
                    </h2>
                    {lastUpdated && (
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#475569' }}>
                            Last refreshed {lastUpdated.toLocaleTimeString()} · auto-refresh every 30 s
                        </p>
                    )}
                </div>
                <button
                    id="refresh-btn"
                    onClick={fetchAppointments}
                    disabled={loading}
                    style={{
                        padding: '0.5rem 1.1rem',
                        borderRadius: 8,
                        border: '1px solid #3b82f6',
                        background: 'rgba(59,130,246,0.1)',
                        color: '#3b82f6',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.5 : 1,
                        transition: 'background 0.2s',
                    }}
                >
                    {loading ? 'Loading…' : '↻ Refresh'}
                </button>
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
                    borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.5rem',
                    color: '#ef4444', fontSize: '0.85rem',
                }}>
                    ⚠ Failed to fetch appointments: {error}
                </div>
            )}

            {/* ── Stat cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Total', value: stats.total, color: '#3b82f6' },
                    { label: 'High Risk', value: stats.high, color: '#ef4444' },
                    { label: 'Moderate Risk', value: stats.moderate, color: '#f59e0b' },
                    { label: 'Low Risk', value: stats.low, color: '#10b981' },
                ].map(s => (
                    <div key={s.label} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{loading ? '—' : s.value}</span>
                    </div>
                ))}
            </div>

            {/* ── Filters & search ── */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    id="search-input"
                    type="text"
                    placeholder="Search patient name, ID…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        padding: '0.5rem 0.9rem',
                        borderRadius: 8,
                        border: '1px solid #2a2f45',
                        background: '#1e2130',
                        color: '#e2e8f0',
                        fontSize: '0.85rem',
                        outline: 'none',
                        flex: '1 1 220px',
                    }}
                />
                {(['all', 'high', 'moderate', 'low'] as const).map(f => (
                    <button
                        key={f}
                        id={`filter-${f}`}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '0.45rem 0.9rem',
                            borderRadius: 8,
                            border: `1px solid ${filter === f ? '#3b82f6' : '#2a2f45'}`,
                            background: filter === f ? 'rgba(59,130,246,0.15)' : 'transparent',
                            color: filter === f ? '#3b82f6' : '#94a3b8',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textTransform: 'capitalize',
                        }}
                    >
                        {f === 'all' ? 'All' : `${f.charAt(0).toUpperCase() + f.slice(1)} Risk`}
                    </button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#475569' }}>
                    {visible.length} / {appointments.length} appointments
                </span>
            </div>

            {/* ── Table ── */}
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                {loading && appointments.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                        Loading appointments…
                    </div>
                ) : visible.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                        No appointments match your filter.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr>
                                {[
                                    { label: 'Patient', key: 'patient_name' as SortKey },
                                    { label: 'Patient ID', key: 'patient_id' as SortKey },
                                    { label: 'Date', key: 'appointment_date' as SortKey },
                                    { label: 'Type', key: 'appointment_type' as SortKey },
                                    { label: 'Status', key: 'status' as SortKey },
                                    { label: 'Risk Score', key: 'no_show_probability' as SortKey },
                                    { label: 'Risk Level', key: 'risk' as SortKey },
                                ].map(col => (
                                    <th key={col.key} style={thStyle} onClick={() => toggleSort(col.key)}>
                                        {col.label} <SortIcon col={col.key} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((appt, idx) => {
                                const isHighRisk = (appt.no_show_probability ?? 0) > 0.7;
                                return (
                                    <tr
                                        key={appt.appointment_id}
                                        id={`row-${appt.appointment_id}`}
                                        style={{
                                            background: isHighRisk
                                                ? 'rgba(239,68,68,0.06)'
                                                : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                                            borderLeft: isHighRisk ? '3px solid #ef4444' : '3px solid transparent',
                                            transition: 'background 0.2s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.07)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = isHighRisk ? 'rgba(239,68,68,0.06)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                                    >
                                        <td style={{ padding: '0.75rem 1rem', color: '#e2e8f0', fontWeight: 500 }}>
                                            {appt.patient_name ?? <span style={{ color: '#475569' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                            {appt.patient_id}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                            {new Date(appt.appointment_date).toLocaleDateString('en-US', {
                                                year: 'numeric', month: 'short', day: 'numeric',
                                            })}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>
                                            {appt.appointment_type ?? '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            {appt.status ? (
                                                <span style={{
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: 6,
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    background: appt.status === 'scheduled' ? 'rgba(59,130,246,0.12)' : 'rgba(100,116,139,0.12)',
                                                    color: appt.status === 'scheduled' ? '#3b82f6' : '#64748b',
                                                    border: `1px solid ${appt.status === 'scheduled' ? '#3b82f655' : '#64748b55'}`,
                                                    textTransform: 'capitalize',
                                                }}>
                                                    {appt.status}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', minWidth: 130 }}>
                                            <ProbBar prob={appt.no_show_probability} />
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <RiskBadge prob={appt.no_show_probability} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
