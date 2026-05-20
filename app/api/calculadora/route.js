import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Adicionamos a busca na tabela 'impressao' (ou o nome que você usou para impressoras)
    const [miolosRes, capasRes, encartesRes, impressorasRes] = await Promise.all([
      pool.query('SELECT * FROM prod_miolo ORDER BY id DESC'),
      pool.query('SELECT * FROM prod_capas'),
      pool.query('SELECT * FROM prod_encarte'),
      pool.query('SELECT * FROM impressoras') // <--- TABELA DE IMPRESSORAS
    ]);

    return NextResponse.json({
      miolos: miolosRes.rows,
      capas: capasRes.rows,
      encartes: encartesRes.rows,
      impressoras: impressorasRes.rows, // <--- ENVIANDO PARA O FRONTEND
      planejamentos: [] 
    });
    
  } catch (error) {
    console.error("Erro ao buscar dados da calculadora:", error);
    return NextResponse.json({ message: "Erro ao buscar dados", error: error.message }, { status: 500 });
  }
}