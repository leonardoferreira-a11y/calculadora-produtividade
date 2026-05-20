import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT p.grafica, p.filtro_producao, p.tiragem, c.dados_calculo
      FROM prod_miolo p
      LEFT JOIN os_calculos c 
        ON UPPER(TRIM(p.sku_miolo)) = UPPER(TRIM(c.sku_miolo))
       AND UPPER(TRIM(p.filtro_producao)) = UPPER(TRIM(c.filtro_producao))
       AND UPPER(TRIM(p.grafica)) = UPPER(TRIM(c.grafica))
      WHERE p.grafica IS NOT NULL AND p.filtro_producao IS NOT NULL
    `);

    // Agrupamento e Soma de KPIs (Dashboard)
    const lotesMap = {};
    
    // Função auxiliar para somar os tempos em texto
    const parseTimeToDecimal = (timeStr) => {
      if (!timeStr || timeStr === 'Pend.' || timeStr === '-') return 0;
      let d = 0, h = 0, m = 0;
      if (timeStr.includes('dia')) {
        const parts = timeStr.split('+');
        d = parseInt(parts[0]) || 0;
        const hm = (parts[1] || '').trim().split(':');
        h = parseInt(hm[0]) || 0;
        m = parseInt(hm[1]) || 0;
      } else {
        const hm = timeStr.split(':');
        h = parseInt(hm[0]) || 0;
        m = parseInt(hm[1]) || 0;
      }
      return (d * 24) + h + (m / 60);
    };

    result.rows.forEach(row => {
      const key = `${row.grafica}|${row.filtro_producao}`;
      if (!lotesMap[key]) {
        lotesMap[key] = {
          grafica: row.grafica,
          filtro_producao: row.filtro_producao,
          total_skus: 0,
          skus_calculados: 0,
          tiragem_total: 0,
          tempo_total_decimal: 0
        };
      }
      
      lotesMap[key].total_skus += 1;
      lotesMap[key].tiragem_total += Number(row.tiragem) || 0;
      
      if (row.dados_calculo) {
        lotesMap[key].skus_calculados += 1;
        const calc = row.dados_calculo;
        let rowDec = 0;
        if (calc.impressao?.resultado?.totais?.total) rowDec += parseTimeToDecimal(calc.impressao.resultado.totais.total);
        if (calc.dobra?.resultado?.totais?.total) rowDec += parseTimeToDecimal(calc.dobra.resultado.totais.total);
        if (calc.alceamento?.resultado?.totais?.total) rowDec += parseTimeToDecimal(calc.alceamento.resultado.totais.total);
        if (calc.grampo?.resultado?.totais?.total) rowDec += parseTimeToDecimal(calc.grampo.resultado.totais.total);
        if (calc.espiral?.resultado?.totais?.total) rowDec += parseTimeToDecimal(calc.espiral.resultado.totais.total);
        
        lotesMap[key].tempo_total_decimal += rowDec;
      }
    });

    return NextResponse.json(Object.values(lotesMap), { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Erro interno" }, { status: 500 });
  }
}