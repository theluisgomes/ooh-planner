# OOH Planner - Planejadora de Mídia Out-of-Home

Aplicação web para planejamento de campanhas OOH com 16 blocos independentes de simulação.

## 🚀 Quick Start

### 1. Instalar Dependências
```bash
npm install
```

### 2. Importar Dados
```bash
npm run import
```

### 3. Iniciar Servidor
```bash
npm start
```

### 4. Acessar Aplicação
Abra seu navegador em: **http://localhost:3000**

## 📋 Funcionalidades

- ✅ **16 Blocos de Mídia Independentes** - Simule até 16 configurações diferentes simultaneamente
- ✅ **Filtros Dinâmicos** - UF, Praça, Taxonomia, Exibidores, Formato, Digital, Estático
- ✅ **Cálculos Automáticos** - Total bruto, total líquido, guardrails (min/max)
- ✅ **Indicadores Visuais** - Eficiência e Exposição (quando dados disponíveis)
- ✅ **Tabela Consolidada** - Visão geral de todas as mídias ativas
- ✅ **Exportação CSV** - Download do planejamento consolidado
- ✅ **Interface Moderna** - Dark mode, glassmorphism, animações suaves

## 🎯 Como Usar

### Configurar um Bloco de Mídia

1. **Selecione os Filtros**
   - UF (Estado)
   - Praça (Cidade)
   - Taxonomia (data produto, data promo, ouro produto, etc.)
   - Exibidores
   - Formato
   - Digital (Sim/Não/Tudo)
   - Estático (Sim/Não/Tudo)

2. **Defina Quantidade e Desconto**
   - `SELETOR_QTD`: Quantidade de peças
   - `SELETOR_DESC`: Desconto (0 a 1, ex: 0.15 = 15%)

3. **Visualize o Resultado**
   - Total Líquido calculado automaticamente
   - Guardrails (Mínimo/Máximo recomendado)
   - Status de validação

### Estados do Bloco

- **✅ CÁLCULO ATIVO** - Bloco configurado e calculado com sucesso
- **⚠️ AVISO** - Quantidade fora do range recomendado
- **❌ INATIVO** - Faltam dados ou filtros inválidos
- **--** - Aguardando configuração

### Exportar Planejamento

1. Configure os blocos desejados
2. Clique em **📥 EXPORTAR CSV**
3. Arquivo será baixado com todas as mídias ativas

## 🗂️ Estrutura do Projeto

```
Planner_ooh_V1/
├── database/
│   ├── schema.sql          # Schema do banco de dados
│   ├── import.js           # Script de importação CSV
│   └── ooh_planner.db      # Banco SQLite (gerado)
├── Datasets/
│   └── Dados_Consolidados_base_adicional - base.csv
├── public/
│   ├── index.html          # Interface principal
│   ├── css/
│   │   └── styles.css      # Estilos modernos
│   └── js/
│       └── app.js          # Lógica da aplicação
├── server.js               # Servidor Express + API
├── package.json
└── README.md
```

## 🔌 API Endpoints

### GET /api/filters
Retorna valores únicos para cada filtro

### POST /api/calculate
Calcula totais baseado em filtros e inputs
```json
{
  "filters": {
    "uf": "sp",
    "praca": "sao paulo",
    "taxonomia": "data promo",
    "exibidores": "JCDecaux",
    "formato": "Relogios",
    "digital": "Tudo",
    "estatico": "Tudo"
  },
  "seletor_qtd": 100,
  "seletor_desc": 0.15
}
```

### POST /api/inventory
Retorna inventário filtrado

### GET /api/stats
Estatísticas do banco de dados

## 📊 Dados

### Estrutura do CSV
- `ID` - Identificador único
- `taxonomia` - Tipo de campanha (data produto, data promo, ouro produto, etc.)
- `uf` - Estado
- `praca` - Cidade
- `exibidores` - Empresa exibidora
- `formato` - Tipo de mídia
- `digital` / `estatico` - Tipo de painel
- `range_minimo` / `range_maximo` - Guardrails
- `unitario_bruto_tabela` - Preço unitário
- `desconto` - Desconto padrão

### Estatísticas Atuais
- **Total de registros**: 1,121
- **UFs únicas**: 27
- **Praças únicas**: 27

## 🔧 Desenvolvimento

### Modo Desenvolvimento
```bash
npm run dev
```
Usa `nodemon` para reload automático

### Reimportar Dados
```bash
npm run import
```
Remove banco existente e reimporta CSV

## ⚠️ Notas Importantes

1. **Indicadores de Eficiência/Exposição**: Atualmente exibem "N/D" pois o CSV não possui colunas `impacto_unit` ou `exposicao_unit`. Adicione essas colunas ao CSV para habilitar os indicadores.

2. **Guardrails**: Os valores de mínimo e máximo são baseados em `range_minimo` e `range_maximo` do inventário.

3. **Cálculos**: 
   - Total Bruto = `seletor_qtd × unitario_bruto_tabela`
   - Total Líquido = `Total Bruto × (1 - seletor_desc)`

## 🎨 Design

- **Dark Mode** nativo
- **Glassmorphism** effects
- **Gradientes vibrantes**
- **Animações suaves**
- **Responsivo** (desktop, tablet, mobile)

## 📝 Licença

ISC
