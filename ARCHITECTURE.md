# Arquitetura - Algoritmo de Escalonamento Gantt/MRP

## Visão Geral

O sistema de agendamento de produção em `app/api/producao/gantt/route.js` é o motor que calcula o cronograma de tarefas de uma gráfica. Ele orquestra:

1. **Tarefas de Produção** (`gantt_tarefas`) - Impressão, Dobra, Espiral, Encadernação, etc.
2. **Máquinas** - Disponibilidade, configuração de turnos, travas calendário
3. **Dependências** - Tarefa A → Tarefa B (sequência obrigatória)
4. **Kits** - Grupos de SKUs que requerem processamento conjunto (Shrink/Encaixotamento)

## Fluxo Principal do Algoritmo

### 1️⃣ Carregamento de Dados (Linhas 14-85)

```
GET gantt_tarefas (tarefas de produção)
  ↓
GET maquinas (captura, turnos, pessoas)
  ↓
GET gantt_calendario_trava (bloqueios de data/máquina)
  ↓
GET kit_calculos + prod_kits (relação pai-filho de SKUs)
```

### 2️⃣ Geração de Tarefas Virtuais de Kit (Linhas 72-177)

Para cada Kit em `kit_calculos`:
- Busca tempos de **Shrink** e **Encaixotamento** em `dados_calculo`
- Injeta 2 tarefas virtuais no array `resTarefas`:
  - `kit-{KIT_ID}-Shrink` (agendado primeiro)
  - `kit-{KIT_ID}-Encaixotamento` (agendado após Shrink)
- Mapeia **componentes filho** (SKUs que compõem o Kit) para validação de dependência

**Mapa Crítico**: `mapaComponentesKit`
- Chave: `${KIT_SKU_UPPER}_${FILTRO_UPPER}`
- Valor: Array de SKUs filhos que devem estar prontos antes do Kit

### 3️⃣ Normalização de Tarefas (Linhas 190-259)

Cada tarefa é enriquecida com metadados:

```javascript
{
  _skuUp: UPPER_CASE(sku_alvo),
  _idUp: UPPER_CASE(id),
  _depUp: UPPER_CASE(id_dependencia),
  _isKit: boolean (Shrink/Encaixotamento/Box),
  _isPUR: boolean (cola PUR = cura 24h obrigatória),
  _isAlc: boolean (Acabamento com adesivo),
  _kitSkus: array de SKUs filhos,
  _kitFiltroOriginal: lote normalizado
}
```

### 4️⃣ Loop de Agendamento Principal (Linhas 358-740)

```
ENQUANTO houver tarefas indefinidas:
  ├─ Para cada tarefa, verificar se está pronta:
  │  ├─ Dependências atendidas? (pai resolvido)
  │  ├─ Se é Kit: TODOS os SKUs filhos prontos?
  │  ├─ Se é Shrink: aguarda componentes (lote igual)
  │  └─ Se é Encaixotamento: aguarda Shrink + componentes
  │
  ├─ Adicionar prontas a candidatosAptos
  │
  ├─ Ordenar candidatos por:
  │  1. Kits prontos SEMPRE primeiro (CORREÇÃO BUG 2)
  │  2. Tempo disponível máquina (AST)
  │  3. Prioridade do lote
  │
  ├─ Pegar primeiro candidato
  │
  ├─ Calcular janela de trabalho:
  │  ├─ Respeitar turnos (dias_trabalho, horas_diarias)
  │  ├─ Respeitar travas calendario
  │  ├─ Distribuir entre máquinas (DILUIR/CONCORRENTE/JUNTO)
  │  └─ Aplicar cura PUR (24h extra se necessário)
  │
  ├─ Registrar tarefa em tarefasResolvidas
  │
  └─ Remover de indefinitas e prosseguir
```

## 🐛 Bugs Corrigidos e Soluções

### Bug 1: Perda de Conexão Pai-Filho

**Problema**:
- Kit SKU era `KIT-123`, mas mapeamento procurava por SKU diferente
- Chave `mapaComponentesKit` era construída com `id_codigo_kit` (vindo de `kit_calculos`)
- Busca posterior usava `sku_alvo` da tarefa (potencialmente diferente)
- Resultado: Componentes filhos não eram encontrados → Kit agendado sem validação

**Solução** (Linhas 87-100, 429-442):
```javascript
// Normalize SEMPRE para maiúscula + filtro
const key = `${UPPER_CASE(kit_id)}_${UPPER_CASE(filtro)}`;
mapaComponentesKit.set(key, [...skus_filhos]);

// Posterior: buscar com mesma normalização
let chaveMapaKit = `${t._skuUp}_${loteAlvo}`;
let baseComp = mapaComponentesKit.get(chaveMapaKit) || [];

// Fallback: se não encontrar exato, tenta prefixo
if (baseComp.length === 0) {
  for (const [chave, comp] of mapaComponentesKit) {
    if (chave.startsWith(`${t._skuUp}_`)) {
      baseComp = comp;
      break;
    }
  }
}
```

### Bug 2: Escalonamento no Final (Late Scheduling)

**Problema**:
- Kit com componentes prontos era agendado apenas se fosse o primeiro na fila
- Outras tarefas eram processadas antes, mesmo tendo tempo de máquina depois
- Resultado: Kits agendados apenas no final, não imediatamente após componentes

**Solução** (Linhas 587-610):
```javascript
candidatosAptos.sort((a, b) => {
  // Kits prontos SEMPRE primeiro
  const aIsKit = a.tarefa._isKit ? 1 : 0;
  const bIsKit = b.tarefa._isKit ? 1 : 0;
  if (aIsKit !== bIsKit) return bIsKit - aIsKit; // Kits primeiro
  
  // Depois: ordem normal (AST, prioridade lote)
  if (a.ast !== b.ast) return a.ast - b.ast;
  return getPrioridade(a) - getPrioridade(b);
});
```

## 📊 Estrutura de Dados

### Mapa de Resolvidas
```javascript
resolvidasMap {
  "IMPRESSAO_SKU1" → {
    id, sku_alvo, nome_etapa,
    data_inicio, data_fim, maquina_id,
    tempo_producao_efetivo,
    _isPUR, _isAlc, ...
  }
}

resolvidasPorSku {
  "SKU1" → [tarefa1, tarefa2, ...]
}
```

### Mapa de Indefinidas
```javascript
indefinitasPorSku {
  "SKU1" → [tarefa_pendente1, ...]
}

indefinitasById {
  "ID_TAREFA" → tarefa
}
```

### Controle de Máquinas
```javascript
controleMaquinasFim {
  "MAQUINA_ID" → [data_fim_slot1, data_fim_slot2, ...]
}
```

## 🎯 Validações Críticas

### 1. Dependência Simples (id_dependencia)
Se tarefa B depende de tarefa A:
- Aguarda tarefa A estar em `resolvidasMap`
- Usa `data_fim` de A como `tempoProntidaoTecnica` de B

### 2. Dependência de Kit (Shrink/Encaixotamento)
```
SKU_Filho1 → Impressão → RESOLVIDOSSKU_Filho1
SKU_Filho2 → Dobra → RESOLVIDO
         ↓
SKU_Kit → Shrink (aguarda TODOS os filhos + lote igual)
         ↓
SKU_Kit → Encaixotamento (aguarda Shrink)
```

### 3. Regras Especiais

| Condição | Comportamento |
|----------|---------------|
| _isPUR (Cola PUR) | +24h obrigatória após tarefa pai |
| _isEspiral + _isFura | Cálculo de retardo dinâmico |
| _isDobra + _isImp | Aguarda impressão + delay configurável |
| Capacidade máquina | Distribui entre DILUIR/CONCORRENTE/JUNTO |

## 🔧 Simuladores de Máquina

Via `simuladores[mqId]`:
```javascript
{
  usadas: número de máquinas ativas,
  modo: "DILUIR" | "CONCORRENTE" | "JUNTO"
}
```

- **DILUIR**: Divide tempo por máquinas (paraleliza)
- **CONCORRENTE**: Executa simultaneamente, retorna menor fim
- **JUNTO**: Agrupa máquinas próximas, divide proporcionalmente

## 📝 Logs de Debug

Sistema inclui `console.log` em pontos críticos:
- `[KIT-DEBUG]` - Rastreamento de lógica de dependência
- `[PRIORITY-DEBUG]` - Seleção de candidatos prioritários

Use em desenvolvimento para validar:
```
[KIT-DEBUG] Kit SKU_KIT: Fallback encontrou componentes na chave ...
[KIT-DEBUG] Kit kit-ID aguardando: SKU_FILHO ainda tem tarefas indefinidas
[KIT-DEBUG] Kit kit-ID pronto! tempoProntidaoTecnica=...
[PRIORITY-DEBUG] Kit kit-ID elevado para primeira posição
```

## 🚀 Otimizações Futuras

1. **Paralelização de busca de componentes** - Usar índice por SKU
2. **Cache de validação de lote** - Evitar recálculos
3. **Retry inteligente** - Se fila travar, pegar próximo candidato
4. **Métricas de eficiência** - Tempo ocioso de máquinas, utilização

## 📞 Contato

Algoritmo mantido por: `leonardo.ferreira@arcoeducacao.com.br`
Última atualização: 2026-09-22
