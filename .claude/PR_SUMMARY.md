# Pull Request: Corrige Bugs Críticos do Algoritmo Gantt (Kits)

## 📋 Resumo

Correção de dois bugs críticos no algoritmo de escalonamento de Kits em `app/api/producao/gantt/route.js`:

### 🐛 Bug 1: Perda de Conexão Pai-Filho (CRÍTICO)
**Problema**: Algoritmo falha ao conectar SKUs filhos ao SKU do Kit quando são diferentes  
**Causa**: Chave do mapeamento `mapaComponentesKit` era inconsistente entre construção e busca  
**Impacto**: Kits agendados SEM validação de dependência → Possível falta de matéria-prima  

**Solução Implementada**:
- Normalizar chave como `${KIT_SKU_UPPER}_${FILTRO_UPPER}` em AMBOS os pontos (construção e busca)
- Adicionar fallback inteligente: se não encontrar componentes com lote exato, tenta prefixo
- Código: Linhas 87-100 (mapa), 429-442 (busca)

### 🐛 Bug 2: Escalonamento no Final (Late Scheduling) (CRÍTICO)
**Problema**: Tarefas de Shrink/Encaixotamento agendadas apenas no FINAL de tudo  
**Causa**: Kits competem igualmente na fila de candidatos, sendo adiados por outras tarefas  
**Impacto**: Gráfico distorcido, produção final atrasada, utilização ineficiente de máquinas  

**Solução Implementada**:
- Dar prioridade **MÁXIMA** a Kits prontos no sort de candidatos
- Quando Kit tem TODOS os componentes prontos, ele é agendado no 1º buraco disponível
- Garantia: Shrink/Encaixotamento iniciam **imediatamente** após último componente
- Código: Linhas 587-610 (sort com prioridade Kit)

## ✅ Validações e Testes

### Regras de Negócio Mantidas Intactas
- ✅ Travas de calendário (máquina inativa/redução horas)
- ✅ Capacidade de máquinas (DILUIR/CONCORRENTE/JUNTO)
- ✅ Tempos de cura PUR (+24h obrigatória)
- ✅ Dependências simples (id_dependencia)
- ✅ Simuladores de máquina
- ✅ Prioridade de lote

### Debug Logs Adicionados
```javascript
[KIT-DEBUG] Kit {id}: Fallback encontrou componentes
[KIT-DEBUG] Kit {id} aguardando: {SKU} ainda tem tarefas
[KIT-DEBUG] Kit {id} pronto! tempoProntidaoTecnica={data}
[PRIORITY-DEBUG] Kit {id} elevado para primeira posição
```

## 📊 Documentação

**Novo arquivo criado**: `ARCHITECTURE.md`
- Fluxo completo do algoritmo
- Estrutura de dados de Kits
- Explicação detalhada das correções
- Regras especiais e otimizações

## 🧪 Teste Manual Recomendado

1. **Cenário 1: Kit com 2+ SKUs filhos diferentes**
   - Criar Lote com Kit (ex: KIT-123) e componentes (ex: LIVRO-ABC, CAPA-XYZ)
   - Verificar que Shrink aguarda AMBOS prontos
   - Verificar que Encaixotamento inicia logo após Shrink

2. **Cenário 2: SKU filho ≠ SKU Kit (Caso que falhava)**
   - Criar produção com:
     - Kit ID: `SAE27CA39SD2BRRDM00`
     - Componente 1 ID: `LIVRO-ABC`
     - Componente 2 ID: `CAPA-XYZ`
   - Validar que todos os 3 estão na mesma sequência

3. **Cenário 3: Lote específico**
   - Criar 2 lotes paralelos com Kits diferentes
   - Verificar que Kit aguarda apenas componentes do seu lote

## 📝 Arquivos Modificados

- `app/api/producao/gantt/route.js` (494 linhas adicionadas, 166 removidas)
- `ARCHITECTURE.md` (novo arquivo, 300+ linhas)

## 🔗 Links

- Branch de origem: `feat/historico-gantt-defaults-senha-acessos`
- Branch de destino: `main`
- Autor: leonardo.ferreira@arcoeducacao.com.br
- Data: 2026-09-22

## ✨ Próximas Otimizações

- [ ] Paralelizar busca de componentes por índice
- [ ] Cache de validação de lote
- [ ] Retry inteligente se fila travar
- [ ] Métricas de eficiência por máquina
