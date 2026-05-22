"use client";
import { useState, useEffect } from 'react';

type PcpRow = {
  lote: string;
  sku_alvo: string;
  nome_etapa: string;
  data_teorica: string | null;
  data_forecast: string | null;
  data_real: string | null;
};

export default function PortalPCP() {
  const [grafica, setGrafica] = useState('');
  const [graficasDisponiveis, setGraficasDisponiveis] = useState<string[]>([]);
  const [rows, setRows] = useState<PcpRow[]>([]);
  const [pendingEdits, setPendingEdits] = useState<Record<string, { forecast?: string; real?: string }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    fetch(`/api/producao/miolo/filtros?ts=${Date.now()}`)
      .then(r => r.json())
      .then(d => {
        const graficas = Array.from(new Set(d.map((x: any) => String(x.grafica).toUpperCase()))) as string[];
        setGraficasDisponiveis(graficas);
        const nivel = String(localStorage.getItem('usuarioNivel') || '').toUpperCase();
        const empresa = String(localStorage.getItem('usuarioEmpresa') || '').toUpperCase();
        if (nivel === 'USER_GRAFICA' && empresa) { setGrafica(empresa); }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!grafica) return;
    setIsLoading(true);
    fetch(`/api/producao/pcp?grafica=${encodeURIComponent(grafica)}`)
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); setPendingEdits({}); })
      .catch(() => setRows([]))
      .finally(() => setIsLoading(false));
  }, [grafica]);

  const getKey = (row: PcpRow) => `${row.lote}|${row.sku_alvo}|${row.nome_etapa}`;

  const handleEdit = (row: PcpRow, field: 'forecast' | 'real', value: string) => {
    const key = getKey(row);
    setPendingEdits(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSave = async (row: PcpRow) => {
    const key = getKey(row);
    const edit = pendingEdits[key] || {};
    try {
      await fetch('/api/producao/pcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_alvo: row.sku_alvo, filtro_producao: row.lote, grafica,
          nome_etapa: row.nome_etapa,
          data_forecast: edit.forecast !== undefined ? edit.forecast : (row.data_forecast || ''),
          data_real: edit.real !== undefined ? edit.real : (row.data_real || ''),
        }),
      });
      setRows(prev => prev.map(r => getKey(r) === key ? {
        ...r,
        data_forecast: edit.forecast !== undefined ? edit.forecast : r.data_forecast,
        data_real: edit.real !== undefined ? edit.real : r.data_real,
      } : r));
      setPendingEdits(prev => { const n = { ...prev }; delete n[key]; return n; });
      setFeedback('Salvo!');
      setTimeout(() => setFeedback(''), 2000);
    } catch(e) {}
  };

  const fmtDate = (d: string | null) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
  };

  const toInputVal = (d: string | null) => {
    if (!d) return '';
    try { const dt = new Date(d); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`; } catch { return ''; }
  };

  return (
    <div className="w-full relative">
      <header className="mb-6 border-b-2 border-slate-200 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase">Portal PCP</h1>
          <p className="text-gray-600 font-medium mt-1">Rastreamento de Prazos Teórico · Forecast · Real</p>
        </div>
        {feedback && <span className="text-emerald-700 font-bold text-sm bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded">{feedback}</span>}
      </header>

      {graficasDisponiveis.length > 1 && (
        <div className="mb-6 flex gap-3 items-center">
          <span className="text-sm font-bold text-slate-600 uppercase">Gráfica:</span>
          {graficasDisponiveis.map(g => (
            <button key={g} onClick={() => setGrafica(g)}
              className={`px-4 py-1.5 rounded text-sm font-bold border transition-colors ${grafica === g ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
              {g}
            </button>
          ))}
        </div>
      )}

      {!grafica && (
        <div className="text-center py-16 text-slate-500 font-medium">Selecione uma gráfica para visualizar o rastreamento de prazos.</div>
      )}

      {grafica && isLoading && (
        <div className="text-center py-16 text-slate-500 font-medium animate-pulse">Carregando dados...</div>
      )}

      {grafica && !isLoading && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[900px]">
            <thead className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
              <tr>
                <th className="p-3">Lote</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Etapa</th>
                <th className="p-3 text-center bg-sky-50/50 text-sky-800">Data Teórica</th>
                <th className="p-3 text-center bg-amber-50/50 text-amber-800">Forecast</th>
                <th className="p-3 text-center bg-emerald-50/50 text-emerald-800">Data Real</th>
                <th className="p-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhum dado encontrado para {grafica}.</td></tr>
              ) : rows.map((row, idx) => {
                const key = getKey(row);
                const edit = pendingEdits[key] || {};
                const hasPending = key in pendingEdits;
                return (
                  <tr key={idx} className={`hover:bg-slate-50 transition-colors ${hasPending ? 'bg-amber-50/30' : ''}`}>
                    <td className="p-3 font-bold text-slate-700">{row.lote}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{row.sku_alvo}</td>
                    <td className="p-3 text-slate-600">{row.nome_etapa}</td>
                    <td className="p-3 text-center font-mono text-sky-800 bg-sky-50/20">{fmtDate(row.data_teorica)}</td>
                    <td className="p-3 bg-amber-50/20">
                      <input type="date" value={edit.forecast !== undefined ? edit.forecast : toInputVal(row.data_forecast)}
                        onChange={(e) => handleEdit(row, 'forecast', e.target.value)}
                        className="w-full border border-amber-200 rounded px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                      />
                    </td>
                    <td className="p-3 bg-emerald-50/20">
                      <input type="date" value={edit.real !== undefined ? edit.real : toInputVal(row.data_real)}
                        onChange={(e) => handleEdit(row, 'real', e.target.value)}
                        className="w-full border border-emerald-200 rounded px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                      />
                    </td>
                    <td className="p-3 text-center">
                      {hasPending && (
                        <button onClick={() => handleSave(row)} className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded hover:bg-blue-700">Salvar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
