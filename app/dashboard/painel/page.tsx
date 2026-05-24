"use client";
import { useState, useEffect, useMemo } from 'react';

type PainelRow = {
  lote: string;
  sku_alvo: string;
  grafica: string;
  status_producao: string | null;
  data_teorica: string | null;
  data_prazo: string | null;
  tiragem: number | null;
  paginacao: number | null;
  acabamento: string | null;
};

const STATUS_OPTIONS = ['Em Análise', 'Aprovada', 'Em Produção', 'Produzida', 'Cancelada'];

const statusStyle = (s: string | null) => {
  if (!s) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (s === 'Em Análise') return 'bg-orange-100 text-orange-800 border-orange-300';
  if (s === 'Aprovada') return 'bg-blue-100 text-blue-800 border-blue-300';
  if (s === 'Em Produção') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  if (s === 'Produzida') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (s === 'Cancelada') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-slate-100 text-slate-500 border-slate-200';
};

const fmtDate = (d: string | null) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return d; }
};

export default function PainelUnificado() {
  const [grafica, setGrafica] = useState('');
  const [graficasDisponiveis, setGraficasDisponiveis] = useState<string[]>([]);
  const [rows, setRows] = useState<PainelRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [filterLote, setFilterLote] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedLotes, setExpandedLotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/producao/miolo/filtros?ts=${Date.now()}`)
      .then(r => r.json())
      .then(d => {
        const gs = Array.from(new Set(d.map((x: any) => String(x.grafica).toUpperCase()))) as string[];
        setGraficasDisponiveis(gs);
        const nivel = String(localStorage.getItem('usuarioNivel') || '').toUpperCase();
        const empresa = String(localStorage.getItem('usuarioEmpresa') || '').toUpperCase();
        if (nivel === 'USER_GRAFICA' && empresa) setGrafica(empresa);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!grafica) return;
    setIsLoading(true);
    setSelectedKeys(new Set());
    fetch(`/api/producao/painel?grafica=${encodeURIComponent(grafica)}`)
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); })
      .catch(() => setRows([]))
      .finally(() => setIsLoading(false));
  }, [grafica]);

  const getKey = (row: PainelRow) => `${row.lote}|${row.sku_alvo}`;

  const filteredRows = useMemo(() => rows.filter(r => {
    const matchLote = !filterLote || r.lote.toUpperCase().includes(filterLote.toUpperCase());
    const matchStatus = !filterStatus || (filterStatus === '__NONE__' ? !r.status_producao : r.status_producao === filterStatus);
    return matchLote && matchStatus;
  }), [rows, filterLote, filterStatus]);

  const lotesAgrupados = useMemo(() => {
    const map = new Map<string, PainelRow[]>();
    filteredRows.forEach(r => {
      if (!map.has(r.lote)) map.set(r.lote, []);
      map.get(r.lote)!.push(r);
    });
    return map;
  }, [filteredRows]);

  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedKeys.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredRows.map(getKey)));
    }
  };

  const toggleSelectLote = (lote: string) => {
    const loteRows = filteredRows.filter(r => r.lote === lote);
    const allSelected = loteRows.every(r => selectedKeys.has(getKey(r)));
    setSelectedKeys(prev => {
      const n = new Set(prev);
      loteRows.forEach(r => {
        if (allSelected) n.delete(getKey(r)); else n.add(getKey(r));
      });
      return n;
    });
  };

  const toggleExpandLote = (lote: string) => {
    setExpandedLotes(prev => {
      const n = new Set(prev);
      if (n.has(lote)) n.delete(lote); else n.add(lote);
      return n;
    });
  };

  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedKeys.size === 0) return;
    setIsApplying(true);
    const selectedRows = filteredRows.filter(r => selectedKeys.has(getKey(r)));
    try {
      const res = await fetch('/api/producao/painel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grafica,
          updates: selectedRows.map(r => ({
            sku_alvo: r.sku_alvo,
            filtro_producao: r.lote,
            status_producao: bulkStatus,
          })),
        }),
      });
      if (res.ok) {
        const updatedKeys = new Set(selectedRows.map(getKey));
        setRows(prev => prev.map(r =>
          updatedKeys.has(getKey(r)) ? { ...r, status_producao: bulkStatus } : r
        ));
        setSelectedKeys(new Set());
        setBulkStatus('');
        setFeedback(`✅ ${selectedRows.length} SKUs atualizados para "${bulkStatus}"`);
        setTimeout(() => setFeedback(''), 4000);
      }
    } catch(e) {
      setFeedback('❌ Erro ao atualizar.');
      setTimeout(() => setFeedback(''), 3000);
    } finally {
      setIsApplying(false);
    }
  };

  const updateSingleStatus = async (row: PainelRow, novoStatus: string) => {
    setRows(prev => prev.map(r => getKey(r) === getKey(row) ? { ...r, status_producao: novoStatus } : r));
    await fetch('/api/producao/painel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grafica, updates: [{ sku_alvo: row.sku_alvo, filtro_producao: row.lote, status_producao: novoStatus }] }),
    }).catch(() => {});
  };

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(r => selectedKeys.has(getKey(r)));

  return (
    <div className="w-full relative">
      <header className="mb-5 border-b-2 border-slate-200 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase">Painel Unificado de Lotes</h1>
          <p className="text-gray-600 font-medium mt-1">Rastreamento de status por SKU com atualização em massa</p>
        </div>
        {feedback && (
          <span className={`text-sm font-bold px-4 py-2 rounded border ${feedback.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {feedback}
          </span>
        )}
      </header>

      {/* Gráfica selector */}
      {graficasDisponiveis.length > 1 && (
        <div className="mb-5 flex gap-2 items-center">
          <span className="text-xs font-bold text-slate-500 uppercase">Gráfica:</span>
          {graficasDisponiveis.map(g => (
            <button key={g} onClick={() => setGrafica(g)}
              className={`px-4 py-1.5 rounded text-sm font-bold border transition-colors ${grafica === g ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      {grafica && !isLoading && rows.length > 0 && (
        <div className="flex gap-3 mb-4 items-center">
          <input
            type="text" placeholder="Filtrar por lote..." value={filterLote}
            onChange={e => setFilterLote(e.target.value)}
            className="border border-slate-200 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-slate-400 w-48"
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-slate-400">
            <option value="">Todos os status</option>
            <option value="__NONE__">Sem status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-xs text-slate-500 font-mono ml-auto">{filteredRows.length} SKUs · {lotesAgrupados.size} lotes</span>
        </div>
      )}

      {/* Floating Action Bar */}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700">
          <span className="text-sm font-bold">{selectedKeys.size} selecionado{selectedKeys.size > 1 ? 's' : ''}</span>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm font-bold outline-none text-white"
          >
            <option value="">-- Novo Status --</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={!bulkStatus || isApplying}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-5 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            {isApplying ? <><i className="fas fa-spinner fa-spin"></i> Aplicando...</> : <><i className="fas fa-check"></i> Aplicar</>}
          </button>
          <button onClick={() => setSelectedKeys(new Set())} className="text-slate-400 hover:text-white text-sm font-bold">&times; Limpar</button>
        </div>
      )}

      {/* Table */}
      {!grafica && (
        <div className="text-center py-20 text-slate-500 font-medium">Selecione uma gráfica para carregar os lotes.</div>
      )}
      {grafica && isLoading && (
        <div className="text-center py-20 text-slate-400 font-medium animate-pulse">Carregando dados...</div>
      )}
      {grafica && !isLoading && filteredRows.length === 0 && (
        <div className="text-center py-20 text-slate-400 font-medium">Nenhum dado encontrado.</div>
      )}

      {grafica && !isLoading && filteredRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-800 text-white text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="p-3 w-10">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll}
                    className="w-4 h-4 accent-blue-500 cursor-pointer rounded" />
                </th>
                <th className="p-3">Lote / SKU</th>
                <th className="p-3 text-center">Tiragem</th>
                <th className="p-3 text-center">Paginação</th>
                <th className="p-3">Acabamento</th>
                <th className="p-3 text-center">Data Teórica</th>
                <th className="p-3 text-center">Prazo Final</th>
                <th className="p-3 text-center">Status MES</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(lotesAgrupados.entries()).map(([lote, loteRows]) => {
                const isExpanded = expandedLotes.has(lote);
                const loteAllSelected = loteRows.every(r => selectedKeys.has(getKey(r)));
                const loteSomeSelected = loteRows.some(r => selectedKeys.has(getKey(r)));
                const loteMinDate = loteRows.reduce((min, r) => (!min || (r.data_teorica && r.data_teorica < min)) ? r.data_teorica : min, null as string | null);
                const loteMaxDate = loteRows.reduce((max, r) => (!max || (r.data_prazo && r.data_prazo > max)) ? r.data_prazo : max, null as string | null);
                const statusCounts = loteRows.reduce((acc, r) => {
                  const s = r.status_producao || 'Sem status';
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                return [
                  // Lote header row
                  <tr key={`lote-${lote}`}
                    className="bg-slate-100 border-y border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                    onClick={() => toggleExpandLote(lote)}>
                    <td className="p-3" onClick={e => { e.stopPropagation(); toggleSelectLote(lote); }}>
                      <input type="checkbox" checked={loteAllSelected} ref={el => { if (el) el.indeterminate = !loteAllSelected && loteSomeSelected; }}
                        onChange={() => toggleSelectLote(lote)}
                        className="w-4 h-4 accent-blue-500 cursor-pointer rounded"
                        onClick={e => e.stopPropagation()} />
                    </td>
                    <td className="p-3 font-black text-slate-800" colSpan={5}>
                      <span className="mr-2 text-violet-700">{isExpanded ? '▼' : '▶'}</span>
                      {lote}
                      <span className="ml-3 text-[10px] font-bold text-slate-500">{loteRows.length} SKUs</span>
                      <span className="ml-3 text-[10px] font-mono text-slate-400">
                        {Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(' · ')}
                      </span>
                    </td>
                    <td className="p-3 text-center text-[10px] font-mono text-slate-600">{fmtDate(loteMinDate)}</td>
                    <td className="p-3 text-center text-[10px] font-mono text-slate-600">{fmtDate(loteMaxDate)}</td>
                    <td className="p-3"></td>
                  </tr>,
                  // SKU rows (shown when expanded)
                  ...(isExpanded ? loteRows.map(row => {
                    const key = getKey(row);
                    const isSelected = selectedKeys.has(key);
                    return (
                      <tr key={key}
                        className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                        <td className="p-3 pl-8">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(key)}
                            className="w-4 h-4 accent-blue-500 cursor-pointer rounded" />
                        </td>
                        <td className="p-3 pl-10 font-mono font-bold text-slate-800">{row.sku_alvo}</td>
                        <td className="p-3 text-center font-mono text-slate-600">{row.tiragem ? Number(row.tiragem).toLocaleString('pt-BR') : '-'}</td>
                        <td className="p-3 text-center font-mono text-slate-600">{row.paginacao || '-'}</td>
                        <td className="p-3 text-slate-600 truncate max-w-[140px]" title={row.acabamento || ''}>{row.acabamento || '-'}</td>
                        <td className="p-3 text-center font-mono text-slate-600">{fmtDate(row.data_teorica)}</td>
                        <td className="p-3 text-center font-mono text-slate-600">{fmtDate(row.data_prazo)}</td>
                        <td className="p-3 text-center">
                          <select
                            value={row.status_producao || ''}
                            onChange={e => updateSingleStatus(row, e.target.value)}
                            className={`text-[10px] font-bold border rounded px-2 py-1 outline-none cursor-pointer ${statusStyle(row.status_producao)}`}
                          >
                            <option value="">-- Status --</option>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  }) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
