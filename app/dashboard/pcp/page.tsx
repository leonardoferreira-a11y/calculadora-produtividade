"use client";
import { useState, useRef, useCallback } from 'react';

type CsvRow = Record<string, string>;

function parseCSV(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.every(c => !c)) continue;
    const row: CsvRow = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

export default function PortalPCP() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState({ msg: '', tipo: '' });
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Por favor, selecione um arquivo .csv'); return; }
    setError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) { setError('Arquivo vazio ou inválido.'); return; }
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) { setError('Não foi possível detectar as colunas. Verifique o formato do arquivo.'); return; }
      setHeaders(headers);
      setRows(rows);
    };
    reader.onerror = () => setError('Erro ao ler o arquivo.');
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const filteredRows = filterQuery
    ? rows.filter(r => Object.values(r).some(v => String(v).toUpperCase().includes(filterQuery.toUpperCase())))
    : rows;

  const clearData = () => { setHeaders([]); setRows([]); setFileName(''); setFilterQuery(''); setError(''); setFeedback({ msg: '', tipo: '' }); };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setIsImporting(true);
    setFeedback({ msg: '', tipo: '' });
    try {
      const res = await fetch('/api/producao/pcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ msg: data.message, tipo: 'sucesso' });
      } else {
        setFeedback({ msg: data.message || 'Erro ao importar.', tipo: 'erro' });
      }
    } catch (e: any) {
      setFeedback({ msg: e.message || 'Erro de rede ao importar.', tipo: 'erro' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="w-full relative">
      <header className="mb-6 border-b-2 border-slate-200 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase">Portal PCP</h1>
          <p className="text-gray-600 font-medium mt-1">Visualizador de CSV — sem integrações, 100% client-side</p>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <input type="text" placeholder="Filtrar em todos os campos..." value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              className="border border-slate-200 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-slate-400 w-56" />
            <span className="text-xs font-mono text-slate-500">{filteredRows.length}/{rows.length} linhas</span>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 border border-blue-700 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
            >
              {isImporting ? <><i className="fas fa-spinner fa-spin"></i> Importando...</> : <><i className="fas fa-database"></i> Importar para Banco</>}
            </button>
            <button onClick={clearData} className="text-xs font-bold text-red-600 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50">
              <i className="fas fa-times mr-1"></i> Limpar
            </button>
          </div>
        )}
      </header>

      {headers.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-slate-300 rounded-2xl p-16 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          onClick={() => inputRef.current?.click()}
        >
          <i className="fas fa-file-csv text-5xl text-slate-300 mb-4"></i>
          <p className="text-lg font-bold text-slate-600 mb-1">Arraste um arquivo CSV aqui</p>
          <p className="text-sm text-slate-400 mb-4">ou clique para selecionar</p>
          <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded">Separador: ; (ponto-e-vírgula) ou , (vírgula)</span>
          <input ref={inputRef} type="file" accept=".csv" className="hidden"
            onChange={e => handleFile(e.target.files?.[0])} />
          {error && <p className="mt-4 text-sm font-bold text-red-600"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
        </div>
      )}

      {feedback.msg && (
        <div className={`mb-4 p-3 rounded-lg border flex items-center gap-2 text-sm font-bold ${feedback.tipo === 'sucesso' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
          <i className={`fas ${feedback.tipo === 'sucesso' ? 'fa-check-circle text-emerald-600' : 'fa-exclamation-circle text-red-600'}`}></i>
          <span>{feedback.msg}</span>
          <button onClick={() => setFeedback({ msg: '', tipo: '' })} className="ml-auto text-xs opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {headers.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <i className="fas fa-check-circle text-emerald-600"></i>
            <span className="text-sm font-bold text-emerald-800">{fileName}</span>
            <span className="text-xs text-emerald-600 font-mono">{rows.length} linhas · {headers.length} colunas</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto max-h-[calc(100vh-320px)]">
            <table className="w-full text-left border-collapse text-xs min-w-max">
              <thead className="sticky top-0 bg-slate-800 text-white text-[10px] uppercase font-bold tracking-wider shadow-md">
                <tr>
                  <th className="p-2 pl-3 text-slate-400 font-mono w-12">#</th>
                  {headers.map((h, i) => (
                    <th key={i} className="p-2 px-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, rIdx) => (
                  <tr key={rIdx} className={`hover:bg-slate-50 transition-colors ${rIdx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="p-2 pl-3 text-slate-400 font-mono text-[10px]">{rIdx + 1}</td>
                    {headers.map((h, cIdx) => (
                      <td key={cIdx} className="p-2 px-3 text-slate-700 whitespace-nowrap max-w-[200px] truncate" title={row[h] || ''}>
                        {row[h] || <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
