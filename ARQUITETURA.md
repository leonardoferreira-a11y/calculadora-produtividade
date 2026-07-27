# 🗺️ Arquitetura do Projeto — CalculArco (Calculadora de Produtividade)

> Guia de manutenção escrito em linguagem simples. Serve para você descobrir
> **qual arquivo mexer** quando aparecer um bug ou quando precisar conferir uma regra.

---

## 1. Visão geral em 30 segundos

Este é um sistema web feito em **Next.js 16** (App Router). Ele tem duas metades:

1. **As telas (o que o usuário vê)** → ficam em arquivos `page.tsx` dentro de `app/`.
2. **As APIs (o que conversa com o banco de dados)** → ficam em arquivos `route.js` dentro de `app/api/`.

As telas **nunca** falam direto com o banco. Elas pedem dados para as APIs, e só as APIs
conversam com o banco PostgreSQL. Pense assim:

```
TELA (page.tsx)  →  API (route.js)  →  BANCO DE DADOS (PostgreSQL)
   o usuário          o "garçom"          a "cozinha/despensa"
```

- Lê CSV com **papaparse** (só na tela de Produção).
- Conecta no banco **Postgres** com **pg** (centralizado em um único arquivo: `lib/db.js`).
- Faz gráficos com **recharts** (só na tela de Fluxo).
- Estilo visual com **Tailwind** (classes como `bg-blue-600` escritas direto no HTML).

---

## 2. Árvore de pastas (ignorando `node_modules` e `.git`)

```
calculadora-produtividade/
│
├── app/                          ← TODO o sistema vive aqui (telas + APIs)
│   │
│   ├── layout.tsx                ← "Moldura" externa do site (fonte, ícones, <html>)
│   ├── page.tsx                  ← TELA DE LOGIN (primeira página, rota "/")
│   ├── globals.css               ← Estilos globais (Tailwind)
│   ├── favicon.ico
│   │
│   ├── dashboard/                ← Área logada (tudo depois do login)
│   │   ├── layout.tsx            ← Menu do topo + regra de permissões (RBAC)
│   │   ├── page.tsx              ← Página inicial do painel (os "cards" de módulos)
│   │   ├── maquinas/page.tsx     ← Cadastro de máquinas (563 linhas)
│   │   ├── producao/page.tsx     ← Importação de CSV / definição de produção (266 linhas)
│   │   ├── registros/page.tsx    ← Cálculo de produção — o MAIOR arquivo (2.545 linhas)
│   │   ├── calculo-kits/page.tsx ← Cálculo de kits (786 linhas)
│   │   ├── gantt/page.tsx        ← Planejamento Gantt visual (914 linhas)
│   │   ├── pcp/page.tsx          ← Portal PCP (159 linhas)
│   │   ├── acessos/page.tsx      ← Gestão de usuários/senhas (266 linhas)
│   │   ├── calculadora/page.tsx  ← Tela de calculadora (267 linhas)
│   │   └── fluxo/page.tsx        ← Dashboard com GRÁFICOS recharts (453 linhas, módulo oculto)
│   │
│   └── api/                      ← O "garçom": tudo que fala com o banco
│       ├── login/route.js        ← Valida e-mail e senha no login
│       ├── importacao/route.js   ← Grava os CSVs importados no banco
│       ├── calculadora/route.js  ← Busca miolos/capas/encartes/impressoras
│       ├── maquinas/route.js     ← Lista/cria máquinas
│       ├── maquinas/[id]/route.js← Edita/apaga UMA máquina (o [id] é o número dela)
│       ├── usuarios/route.js     ← Lista/cria usuários
│       ├── usuarios/[id]/route.js← Edita/apaga UM usuário
│       └── producao/            ← Tudo ligado à produção
│           ├── miolo/route.js
│           ├── miolo/filtros/route.js
│           ├── miolo/salvar-calculo/route.js
│           ├── capas/route.js
│           ├── encarte/route.js
│           ├── kits/route.js
│           ├── kits/filtros/route.js
│           ├── kits/salvar-calculo/route.js
│           ├── calendario/route.js
│           ├── painel/route.js
│           ├── pcp/route.js
│           ├── status/route.js
│           └── gantt/route.js          ← API mais robusta (623 linhas)
│               ├── gantt/datas-iniciais/route.js
│               └── gantt/travas/route.js
│
├── lib/
│   └── db.js                     ← ⭐ ÚNICA conexão com o banco PostgreSQL
│
├── public/                       ← Imagens e logos (logo.png, logo_piffer.png, ícones)
│
├── package.json                  ← Lista de bibliotecas e comandos (dev, build, start)
├── next.config.ts                ← Configuração do Next.js
├── tsconfig.json                 ← Configuração do TypeScript (define o atalho "@/")
├── postcss.config.mjs            ← Configuração do Tailwind
├── eslint.config.mjs             ← Regras de verificação de código
├── AGENTS.md / CLAUDE.md         ← Instruções para assistentes de IA
└── README.md
```

> Nota: `[id]` entre colchetes é uma pasta **dinâmica** do Next.js — significa
> "o número/identificador de um item específico" (ex.: `/api/maquinas/5` edita a máquina 5).

---

## 3. Como funcionam as ROTAS (e por que usamos `app/`, não `pages/`)

Este projeto usa o **App Router** do Next.js 16. Ou seja: usamos a pasta **`app/`**.
**Não existe** a pasta `pages/` (esse era o jeito antigo do Next.js).

A regra é simples: **o caminho da pasta vira o endereço (URL) no navegador.**

| O que o usuário acessa no navegador | Arquivo que desenha a tela |
|---|---|
| `/` (login)                | [app/page.tsx](app/page.tsx) |
| `/dashboard`               | [app/dashboard/page.tsx](app/dashboard/page.tsx) |
| `/dashboard/maquinas`      | [app/dashboard/maquinas/page.tsx](app/dashboard/maquinas/page.tsx) |
| `/dashboard/producao`      | [app/dashboard/producao/page.tsx](app/dashboard/producao/page.tsx) |
| `/dashboard/registros`     | [app/dashboard/registros/page.tsx](app/dashboard/registros/page.tsx) |
| `/dashboard/calculo-kits`  | [app/dashboard/calculo-kits/page.tsx](app/dashboard/calculo-kits/page.tsx) |
| `/dashboard/gantt`         | [app/dashboard/gantt/page.tsx](app/dashboard/gantt/page.tsx) |
| `/dashboard/pcp`           | [app/dashboard/pcp/page.tsx](app/dashboard/pcp/page.tsx) |
| `/dashboard/acessos`       | [app/dashboard/acessos/page.tsx](app/dashboard/acessos/page.tsx) |

E as **APIs** seguem a mesma lógica, mas o arquivo se chama `route.js`:

| Endereço da API | Arquivo |
|---|---|
| `/api/login`              | [app/api/login/route.js](app/api/login/route.js) |
| `/api/importacao`         | [app/api/importacao/route.js](app/api/importacao/route.js) |
| `/api/producao/gantt`     | [app/api/producao/gantt/route.js](app/api/producao/gantt/route.js) |
| ...                       | (mesma regra para todas) |

**Regra de ouro:**
- Arquivo `page.tsx` = **uma tela** que o usuário vê.
- Arquivo `route.js` = **uma API** que busca/grava dados no banco (não tem visual).
- Arquivo `layout.tsx` = **moldura** compartilhada por várias telas (menu, cabeçalho).

---

## 4. Onde está o BANCO DE DADOS (pg) e onde estão os GRÁFICOS (recharts)

### 🗄️ Banco de dados (biblioteca `pg`)

- **A conexão existe em um lugar só:** [lib/db.js](lib/db.js).
  Esse arquivo cria o "pool" (a ligação com o PostgreSQL) usando a senha/endereço
  guardados na variável de ambiente `DATABASE_URL`. **Se o banco parar de conectar,
  comece a investigar por aqui.**

- **Quem usa o banco:** apenas os arquivos `route.js` dentro de `app/api/`.
  Todos eles começam com a linha `import pool from '@/lib/db';` e depois chamam
  `pool.query('SELECT ...')`. São **22 arquivos** de API que conversam com o banco.

- **Exemplo de tabelas usadas no banco** (vistas nas queries): `usuarios`, `prod_miolo`,
  `prod_capas`, `prod_encarte`, `prod_kits`, `prod_datas_iniciais`, `impressoras`,
  `gantt_tarefas`.

### 📊 Gráficos (biblioteca `recharts`)

- Os gráficos aparecem em **um único arquivo**: [app/dashboard/fluxo/page.tsx](app/dashboard/fluxo/page.tsx).
  (Esse módulo "Fluxo" está atualmente **oculto** do menu — veja os comentários em
  [app/dashboard/layout.tsx](app/dashboard/layout.tsx).)
- Se precisar mexer em qualquer gráfico, é nesse arquivo.

### 📑 Leitura de CSV (biblioteca `papaparse`)

- A importação de planilhas CSV acontece em **um único arquivo**:
  [app/dashboard/producao/page.tsx](app/dashboard/producao/page.tsx).
- Essa tela lê o CSV no navegador e manda os dados para a API
  [app/api/importacao/route.js](app/api/importacao/route.js), que grava no banco.

---

## 5. Resumo claro: onde o app começa e como a informação flui

### ▶️ Onde o app começa

1. **`app/layout.tsx`** é a moldura externa de tudo (define a fonte, o idioma `pt-BR`
   e carrega os ícones FontAwesome). Toda tela é desenhada "dentro" dele.
2. A primeira tela que o usuário vê é o **login**: [app/page.tsx](app/page.tsx).
3. Depois de logar, ele entra na área `/dashboard`, que tem a sua própria moldura com
   o menu do topo: [app/dashboard/layout.tsx](app/dashboard/layout.tsx).

### 🔄 Como a informação flui (exemplo do login, passo a passo)

```
1. Usuário digita e-mail/senha na TELA ........... app/page.tsx
2. A tela envia para a API ....................... app/api/login/route.js
3. A API pergunta ao banco se o usuário existe ... usa lib/db.js → tabela "usuarios"
4. A API responde "ok" ou "senha incorreta"
5. Se ok, a tela guarda nome/nível/empresa no navegador (localStorage)
6. A tela redireciona para /dashboard
```

Esse mesmo padrão se repete em **todo** o sistema: a tela (`page.tsx`) faz um `fetch`
para uma API (`route.js`), a API usa o `pool` do `lib/db.js` para falar com o banco, e
devolve os dados em JSON para a tela exibir.

### 🔐 Como funcionam as permissões (quem vê o quê)

- O nível do usuário (`ADMIN`, `ADMIN_MAQ`, `USER_ARCO`, `USER_GRAFICA`) é guardado no
  navegador (localStorage) no momento do login.
- A "tabela de permissões" (RBAC) que decide quais menus cada nível enxerga está em
  [app/dashboard/layout.tsx](app/dashboard/layout.tsx) (a variável `RBAC`, perto do topo).
  **Se um botão de menu precisa aparecer/sumir para um perfil, é aqui.**

### 🗂️ Qual arquivo faz o quê (cola rápida para manutenção)

| Se o problema/regra é sobre... | Mexa neste arquivo |
|---|---|
| Conexão com o banco caiu / credenciais | [lib/db.js](lib/db.js) |
| Tela de login / senha não aceita | [app/page.tsx](app/page.tsx) + [app/api/login/route.js](app/api/login/route.js) |
| Quem pode ver cada menu (permissões) | [app/dashboard/layout.tsx](app/dashboard/layout.tsx) |
| Cards/módulos da página inicial | [app/dashboard/page.tsx](app/dashboard/page.tsx) |
| Importar CSV (planilhas) | [app/dashboard/producao/page.tsx](app/dashboard/producao/page.tsx) + [app/api/importacao/route.js](app/api/importacao/route.js) |
| Validação "arquivo errado na aba errada" | [app/api/importacao/route.js](app/api/importacao/route.js) (variável `ASSINATURAS`) |
| Cadastro de máquinas | [app/dashboard/maquinas/page.tsx](app/dashboard/maquinas/page.tsx) + [app/api/maquinas/route.js](app/api/maquinas/route.js) |
| Cálculo de produção (miolo/capas) | [app/dashboard/registros/page.tsx](app/dashboard/registros/page.tsx) + [app/api/producao/miolo/](app/api/producao/miolo/) |
| Cálculo de kits | [app/dashboard/calculo-kits/page.tsx](app/dashboard/calculo-kits/page.tsx) + [app/api/producao/kits/](app/api/producao/kits/) |
| Planejamento Gantt | [app/dashboard/gantt/page.tsx](app/dashboard/gantt/page.tsx) + [app/api/producao/gantt/route.js](app/api/producao/gantt/route.js) |
| Portal PCP | [app/dashboard/pcp/page.tsx](app/dashboard/pcp/page.tsx) + [app/api/producao/pcp/route.js](app/api/producao/pcp/route.js) |
| Gráficos / dashboard de fluxo | [app/dashboard/fluxo/page.tsx](app/dashboard/fluxo/page.tsx) |
| Usuários / senhas / bloquear acesso | [app/dashboard/acessos/page.tsx](app/dashboard/acessos/page.tsx) + [app/api/usuarios/](app/api/usuarios/) |

---

## 6. Comandos úteis (rodar o projeto)

Estão definidos em [package.json](package.json):

| Comando | O que faz |
|---|---|
| `npm run dev`   | Liga o sistema no seu computador para testar (modo desenvolvimento) |
| `npm run build` | Prepara a versão final para publicar |
| `npm run start` | Roda a versão final já preparada |
| `npm run lint`  | Verifica erros de código |

> ⚠️ O banco precisa da variável de ambiente `DATABASE_URL` configurada (normalmente em
> um arquivo `.env.local` na raiz, ou nas configurações da Vercel) para funcionar.

---

## 7. Dicas de ouro para quem não programa

- **Telas terminam em `page.tsx`. APIs terminam em `route.js`.** Comece sempre
  identificando se o bug é "visual" (tela) ou "de dados" (API/banco).
- **O atalho `@/` significa "a partir da raiz do projeto"** — ex.: `@/lib/db`
  é o mesmo que `lib/db.js`. Isso está configurado em [tsconfig.json](tsconfig.json).
- Os textos `"use client"` no topo de uma tela indicam que ela roda no navegador
  (com botões/interações). Não apague essa linha.
- Quando uma tela "não carrega os dados", o problema costuma estar na **API**
  correspondente (`route.js`) ou na **conexão** ([lib/db.js](lib/db.js)) — não na tela.
- O arquivo maior do projeto é [app/dashboard/registros/page.tsx](app/dashboard/registros/page.tsx)
  (2.545 linhas) — é o "motor" de cálculo de produção; mexa nele com cuidado.
