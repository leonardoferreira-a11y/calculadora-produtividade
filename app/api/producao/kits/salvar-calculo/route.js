import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { id_codigo_kit, filtro_producao, grafica, dados_calculo } = body;

    if (!id_codigo_kit || !filtro_producao || !grafica) {
      return NextResponse.json({ message: "Dados incompletos para salvar." }, { status: 400 });
    }

    if (dados_calculo === null) {
      // É uma exclusão (Borracha Inteligente)
      await pool.query(
        `DELETE FROM kit_calculos 
         WHERE UPPER(TRIM(id_codigo_kit)) = UPPER(TRIM($1)) 
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) 
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [id_codigo_kit, filtro_producao, grafica]
      );
    } else {
      // Tenta atualizar, se não existir, insere (Upsert manual)
      const check = await pool.query(
        `SELECT id FROM kit_calculos 
         WHERE UPPER(TRIM(id_codigo_kit)) = UPPER(TRIM($1)) 
           AND UPPER(TRIM(filtro_producao)) = UPPER(TRIM($2)) 
           AND UPPER(TRIM(grafica)) = UPPER(TRIM($3))`,
        [id_codigo_kit, filtro_producao, grafica]
      );

      if (check.rows.length > 0) {
        await pool.query(
          `UPDATE kit_calculos SET dados_calculo = $1, data_calculo = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [JSON.stringify(dados_calculo), check.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO kit_calculos (id_codigo_kit, filtro_producao, grafica, dados_calculo) 
           VALUES ($1, $2, $3, $4)`,
          [id_codigo_kit, filtro_producao, grafica, JSON.stringify(dados_calculo)]
        );
      }
    }

    return NextResponse.json({ message: "Sucesso" }, { status: 200 });
  } catch (error) {
    console.error("Erro ao salvar cálculo do kit:", error);
    return NextResponse.json({ message: "Erro interno no servidor." }, { status: 500 });
  }
}