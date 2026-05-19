# OOH Planner - Roadmap Técnico da Fase 2

Este documento serve como referência de implementação para agentes de IA e desenvolvedores que irão evoluir o OOH Planner da V1 para a Fase 2.

O foco é técnico e operacional: arquitetura, sequência de execução, critérios de aceite, reaproveitamento da V1 e guardrails para evitar decisões implícitas durante o desenvolvimento.

## 1. Objetivo

A Fase 2 deve transformar o OOH Planner de um MVP funcional em uma plataforma escalável de planejamento OOH, com dados governados, ingestão controlada, engine determinística de recomendação, versionamento e integração analítica.

O objetivo não é apenas adicionar telas. A prioridade é estruturar uma base sustentável para:

- Ingerir novas praças, parceiros e inventários com validação e curadoria.
- Produzir recomendações determinísticas, auditáveis e parametrizáveis.
- Versionar inventário, parâmetros da engine, inputs de planejamento e outputs calculados.
- Integrar dados operacionais com BI sem acoplar o dashboard diretamente a tabelas frágeis.
- Preparar o produto para evolução multi-cliente e multi-campanha.

## 2. Premissa Principal

A Fase 2 não parte do zero.

A V1 já contém partes importantes que devem ser analisadas, reaproveitadas ou usadas como referência:

- `server.js`: backend Express atual e endpoints existentes.
- `services/recommendation-service.js`: lógica de recomendação por budget, ciclo, taxonomia e praça.
- `services/budget-optimizer.js`: cálculo determinístico de ROI, alocação e exposição estimada.
- `services/bigquery-service.js`: integração analítica existente com BigQuery.
- `services/auth-service.js`: autenticação atual, a ser avaliada para hardening ou substituição.
- `database/schema.sql`: schema atual do inventário, útil como ponto de partida para migração.
- `public/js/app.js`: fluxo funcional da interface atual, útil como referência de jornada e estados de UI.

Portanto, a Fase 2 deve ser tratada como evolução arquitetural com reuso seletivo, não como greenfield absoluto.

## 3. Princípios de Implementação

1. **Engine determinística primeiro**  
   A camada crítica de recomendação deve ser previsível, testável e auditável. IA generativa pode existir como camada assistiva, mas não deve tomar decisões críticas de cálculo.

2. **Modelo de dados antes de escala operacional**  
   Ingestão multi-parceiro sem modelo normalizado, versionado e auditável tende a virar concatenação de planilhas.

3. **Versionamento como requisito central**  
   Devem ser versionados: inventário, parâmetros da engine, inputs, outputs e execuções da engine.

4. **API-first**  
   Contratos devem ser definidos antes da implementação completa, preferencialmente em OpenAPI 3.1.

5. **Separação clara entre operacional e analítico**  
   Postgres deve cuidar do transacional/operacional; BigQuery deve cuidar do histórico analítico e BI.

6. **Entrega por risco técnico**  
   Provar primeiro engine isolada e ingestão end-to-end. UI completa e design system vêm depois dos contratos essenciais.

7. **Observabilidade desde o início**  
   Logs estruturados, métricas e trilhas de auditoria fazem parte da plataforma, não apenas do go-live.

## 4. Arquitetura Recomendada

As decisões abaixo são recomendações preferenciais. Alternativas podem ser adotadas quando houver restrição real de equipe, prazo ou infraestrutura, mas a decisão deve ser documentada em ADR.

| Área | Recomendação Preferencial | Alternativa Aceitável | Racional |
|---|---|---|---|
| Repositório | Monorepo | Repo único modularizado | Facilita web, API, engine e shared types evoluírem juntos. |
| Frontend | Next.js / React | React + Vite | A V1 em vanilla JS já mostra limite de manutenção para Fase 2. |
| Backend | Node.js modularizado ou NestJS | Express modularizado | Mantém continuidade com V1 e melhora organização. |
| Engine | Pacote/serviço isolado | Módulo interno bem testado | Permite testes, versionamento, rollback e reuso. |
| Banco operacional | Postgres gerenciado | SQLite apenas local/dev | Necessário para concorrência, versionamento e auditoria. |
| Banco analítico | BigQuery | Data warehouse equivalente | Já existe integração e é adequado para dashboard/BI. |
| Ingestão | Pipeline com raw/curated/serving | Scripts controlados com staging | Evita contaminar a base recomendável com dados inválidos. |
| API | OpenAPI 3.1 | Contratos TypeScript compartilhados | Reduz ambiguidades entre web, API, engine e BI. |
| Infra | Containers + IaC | Containers com scripts manuais iniciais | Ambientes Dev/Hml/Prod devem ser reprodutíveis. |
| CI/CD | GitHub Actions | Pipeline equivalente | Caminho natural pelo uso atual do GitHub. |
| Observabilidade | Logs estruturados + métricas + tracing | Logs estruturados + métricas mínimas | Plataforma precisa ser operável e auditável. |
| Auth | Provedor gerenciado ou hardening formal | Auth atual somente se revisado | Auth caseiro aumenta responsabilidade de segurança. |

## 5. Estrutura Alvo de Repositório

Estrutura recomendada caso a Fase 2 evolua para monorepo:

```txt
ooh-planner-v2/
├── apps/
│   ├── web/                 # Frontend Next.js
│   └── api/                 # Backend/API
├── packages/
│   ├── engine/              # Motor determinístico de recomendação
│   ├── shared/              # Tipos, schemas e utilitários comuns
│   └── validation/          # Regras de validação de dados e inputs
├── docs/
│   ├── adr/                 # Architecture Decision Records
│   ├── api/                 # OpenAPI e contratos
│   ├── data-model/          # Modelo lógico/físico
│   └── runbooks/            # Operação, rollback e incidentes
├── infra/
│   ├── terraform/           # Infra como código
│   └── docker/              # Containers e compose local
├── pipelines/
│   └── ingestion/           # Jobs/scripts de ingestão
└── tests/
    ├── golden/              # Cenários fixos da engine
    ├── integration/         # API + banco + ingestão
    └── e2e/                 # Jornadas críticas
```

Se a decisão for evoluir dentro do repo atual, preservar a mesma separação conceitual:

- `apps/web` pode nascer a partir do conteúdo de `public/`.
- `apps/api` pode nascer a partir de `server.js`.
- `packages/engine` pode nascer a partir de `services/recommendation-service.js` e `services/budget-optimizer.js`.
- `packages/shared` deve concentrar schemas, tipos e contratos comuns.

## 6. Modelo de Dados V2

O modelo atual é centrado em uma tabela flat de inventário. Para a Fase 2, isso deve evoluir para um modelo normalizado, versionado e preparado para ingestão de múltiplos parceiros.

Entidades mínimas recomendadas:

- `clients`: clientes ou marcas atendidas.
- `campaigns`: campanhas planejadas.
- `markets`: praças, UFs e agrupamentos comerciais.
- `partners`: exibidores/parceiros.
- `formats`: formatos de mídia.
- `assets`: ativos/faces disponíveis.
- `inventory_snapshots`: snapshots versionados do inventário por ciclo.
- `pricing_history`: histórico de preço, desconto e negociações.
- `planning_inputs`: inputs informados pelo usuário.
- `planning_versions`: versões salvas de um planejamento.
- `engine_param_sets`: conjuntos versionados de parâmetros da engine.
- `engine_runs`: execuções da engine, com hash de parâmetros e versão.
- `planning_outputs`: resultados calculados e persistidos.
- `ingestion_batches`: lotes de ingestão.
- `audit_events`: trilha de auditoria.

Requisitos obrigatórios:

- Todo output deve apontar para a versão dos parâmetros da engine usada.
- Todo output deve apontar para o snapshot de inventário usado.
- Mudanças em preço, range, praça, parceiro e formato devem ser rastreáveis.
- Um planejamento deve poder ser reprocessado com a versão original da engine.
- Dados brutos de ingestão não devem sobrescrever automaticamente dados curados.

## 7. Engine de Recomendação

A engine atual da V1 deve ser reaproveitada como base técnica.

O trabalho da Fase 2 deve ser tratado como:

1. Extração da lógica atual para módulo isolado.
2. Parametrização externa dos pesos e regras.
3. Versionamento dos parâmetros.
4. Testes determinísticos com cenários reais.
5. Registro auditável de cada execução.

### Requisitos

- Mesmo input + mesmo inventário + mesma versão de parâmetros devem gerar o mesmo output.
- Toda recomendação deve ser explicável.
- Toda execução deve guardar versão/hash da engine e dos parâmetros.
- Mudanças de pesos/regras devem ser versionadas.
- Deve ser possível comparar duas versões da engine sobre o mesmo input.
- Deve ser possível reprocessar um planejamento antigo com a configuração original.

### Não Fazer

- Não acoplar engine diretamente à UI.
- Não deixar pesos hardcoded sem caminho claro de versionamento.
- Não alterar regras de cálculo sem golden tests.
- Não usar IA generativa para substituir regras determinísticas críticas.

## 8. Estratégia de Ingestão

Ingestão deve ser tratada como fluxo governado, não como importação pontual.

Fluxo recomendado:

1. Receber base ou arquivo.
2. Criar `ingestion_batch`.
3. Armazenar dados em camada raw.
4. Validar estrutura, tipos e campos obrigatórios.
5. Validar regras de negócio.
6. Identificar duplicidades, lacunas e inconsistências.
7. Enviar registros inválidos para quarentena.
8. Permitir curadoria/aprovação.
9. Promover registros válidos para camada curated.
10. Publicar snapshot aprovado para camada serving/engine.

Validações mínimas:

- Campos obrigatórios preenchidos.
- Tipos compatíveis.
- Praça, UF, parceiro e formato reconhecidos.
- Preços positivos.
- Ranges mínimos e máximos coerentes.
- Duplicidade por parceiro, ativo, praça, formato e ciclo.
- Diferenças relevantes contra snapshot anterior.
- Relatório de inconsistências por batch.

## 9. Roadmap de Implementação

### Fase 0 - Preparação e Decisões Técnicas

Objetivo: reduzir ambiguidade antes de alterar arquitetura.

Entregas:

- ADRs iniciais para frontend, backend, banco, engine, ingestão, auth e observabilidade.
- Estratégia GitHub/repositório definida.
- Estratégia de migração V1 -> V2 definida.
- Contratos iniciais de API em OpenAPI.
- Modelo lógico V2 aprovado.

Critérios de aceite:

- Nenhuma implementação estrutural começa sem ADRs mínimos.
- Principais entidades e relacionamentos do modelo V2 estão documentados.
- Contratos principais da API estão versionados.

### Fase 1 - Fundação Técnica

Objetivo: preparar base de desenvolvimento reprodutível.

Entregas:

- Estrutura de monorepo ou modularização equivalente.
- CI mínimo.
- Setup local documentado.
- Banco operacional Postgres em ambiente local/dev.
- Migrações iniciais do modelo V2.
- Esqueleto de API e healthcheck.

Critérios de aceite:

- Um novo desenvolvedor/agente consegue subir o ambiente local seguindo documentação.
- Migrações rodam do zero.
- CI executa lint/testes mínimos.

### Fase 2 - Engine Isolada

Objetivo: transformar a lógica atual em engine testável e versionada.

Entregas:

- Extração de `recommendation-service` e `budget-optimizer` para módulo/pacote de engine.
- Tipos/schemas de input e output.
- Parâmetros externos e versionados.
- Golden tests com cenários reais da V1.
- Endpoint inicial de recomendação.
- Registro de `engine_runs`.

Critérios de aceite:

- Engine roda independente da UI.
- Cenários reais da V1 passam nos golden tests.
- Cada execução registra versão dos parâmetros.
- Mudança de parâmetro sem teste correspondente não é aceita.

### Fase 3 - Modelo de Dados e Migração

Objetivo: migrar da tabela flat para base versionada e auditável.

Entregas:

- Tabelas V2 criadas.
- Script de migração da base V1.
- Mapeamento de campos V1 -> V2 documentado.
- Snapshots iniciais de inventário.
- Auditoria mínima de alterações.

Critérios de aceite:

- Inventário atual pode ser migrado sem perda relevante.
- Engine consegue consumir snapshot V2.
- Outputs guardam referência ao snapshot usado.

### Fase 4 - Ingestão End-to-End

Objetivo: provar ingestão real com um parceiro ou praça.

Entregas:

- Pipeline raw -> curated -> serving.
- Validações estruturais e de negócio.
- Quarentena de registros inválidos.
- Relatório de inconsistências.
- Promoção controlada para snapshot recomendável.

Critérios de aceite:

- Uma base real entra, é validada, curada e consumida pela engine.
- Dados inválidos não entram na base serving.
- Inconsistências são rastreáveis por batch.

### Fase 5 - Produto P0

Objetivo: entregar fluxo principal de planejamento na nova arquitetura.

Entregas:

- Frontend P0.
- Seleção de praça, ciclo, taxonomia e budget.
- Recomendação gerada por API real.
- Feedback under/fit/over.
- Persistência de planejamento.
- Histórico e versões iniciais.
- Tratamento de loading, vazio e erro.

Critérios de aceite:

- Usuário cria e salva um planejamento completo.
- Output persiste com versão da engine e snapshot usado.
- Fluxo principal pode ser demonstrado sem mocks.

### Fase 6 - Governança, Multi-Parceiro e BI

Objetivo: ampliar escala operacional.

Entregas:

- Ingestão de múltiplos parceiros.
- Perfis de acesso.
- Auditoria de alterações críticas.
- Exportação/replicação para BigQuery.
- Dataset serving para BI.
- Documentação dos contratos de dados.

Critérios de aceite:

- Múltiplos parceiros podem ser ingeridos sem contaminar dados curados.
- BI consome camada analítica ou serving estável.
- Alterações críticas têm trilha de auditoria.

### Fase 7 - Hardening, UAT e Handoff

Objetivo: preparar go-live e operação assistida.

Entregas:

- Logs estruturados.
- Métricas e dashboards operacionais.
- Backup e restauração testados.
- Runbooks.
- Testes E2E.
- UAT com evidências.
- Manual de usuário.
- Documentação técnica.

Critérios de aceite:

- Sistema é monitorável.
- Processo de rollback está documentado.
- Cenários críticos passam em testes automatizados e UAT.
- Handoff operacional concluído.

## 10. Estratégia de Testes

Testes devem ser criados junto com a implementação, não apenas no final.

| Camada | Objetivo | Exemplos |
|---|---|---|
| Unit tests | Validar funções isoladas | Cálculo de ROI, parsing numérico, ranges. |
| Golden tests | Garantir outputs fixos | Input real V1 -> output esperado. |
| Property-based tests | Validar invariantes | Total não excede budget; ranges são respeitados. |
| Contract tests | Garantir compatibilidade | API não quebra frontend/BI. |
| Integration tests | Validar API + banco + ingestão | Batch real, promoção e execução da engine. |
| E2E tests | Validar jornadas críticas | Criar planejamento, salvar versão, reabrir histórico. |
| UAT | Validar uso real | Simulações reais com stakeholders. |

Cenários críticos:

- Planejamento dentro do range.
- Planejamento abaixo do mínimo.
- Planejamento acima do máximo.
- Praça sem inventário suficiente.
- Parceiro com campos ausentes.
- Base com duplicidade.
- Mudança de parâmetros da engine.
- Reprocessamento com versão antiga da engine.
- Exportação para BI.

## 11. Guardrails Para Agentes de IA

Estas instruções devem ser seguidas por qualquer agente de IA trabalhando na Fase 2.

### Antes de Implementar

- Ler este roadmap.
- Ler `README.md`, `server.js`, `database/schema.sql` e os arquivos em `services/` relevantes à tarefa.
- Identificar se a mudança pertence a web, API, engine, dados, ingestão ou infra.
- Verificar se existe ADR ou contrato de API aplicável.
- Se a decisão afetar schema, API pública, engine ou auth, propor plano antes de editar.

### Durante a Implementação

- Manter mudanças pequenas e revisáveis.
- Não misturar refactor amplo com feature funcional.
- Não alterar regras da engine sem testes.
- Não alterar schema sem migration e documentação.
- Não consumir BigQuery como banco operacional.
- Não permitir que dados raw substituam dados curados automaticamente.
- Não hardcodar pesos/regras novos sem caminho de parametrização.
- Não criar endpoints sem documentar contrato.
- Não adicionar dependências estruturais sem justificar.

### Ao Final de Cada Mudança

- Rodar testes aplicáveis.
- Atualizar documentação relacionada quando mudar contrato, schema ou comportamento da engine.
- Registrar novas decisões arquiteturais quando necessário.
- Garantir que outputs da engine continuem determinísticos.
- Confirmar que mudanças preservam rastreabilidade.

## 12. Backlog Técnico Inicial

### P0 - Fundação e Risco Técnico

- Definir estratégia de repositório para V2.
- Criar ADRs iniciais.
- Definir modelo lógico V2.
- Definir OpenAPI inicial.
- Extrair engine para módulo isolado.
- Criar golden tests da engine com cenários reais.
- Criar schema inicial em Postgres.
- Definir estratégia de migração V1 -> V2.
- Implementar ingestão end-to-end para um parceiro real.

### P1 - Produto Operacional

- Implementar frontend P0.
- Persistir planejamentos e versões.
- Registrar `engine_runs`.
- Implementar histórico de planejamento.
- Criar relatórios de inconsistência da ingestão.
- Publicar camada serving para BI.
- Adicionar auditoria básica.
- Implementar E2E das jornadas críticas.

### P2 - Escala e Operação

- Ingestão multi-parceiro.
- RBAC mais granular.
- Feature flags para mudanças de engine.
- Comparação entre versões da engine.
- Dashboards operacionais.
- Runbooks de incidentes.
- Backup/restore automatizado.
- Hardening de auth.

## 13. Critérios Gerais de Aceite da Fase 2

A Fase 2 pode ser considerada tecnicamente pronta quando:

- A engine está isolada, parametrizada, versionada e coberta por golden tests.
- O modelo V2 suporta versionamento de inventário, inputs, outputs e parâmetros.
- Pelo menos um fluxo real de ingestão está validado end-to-end.
- Dados inválidos são bloqueados ou colocados em quarentena.
- Planejamentos são persistidos com versão da engine e snapshot de inventário.
- A API principal está documentada.
- O frontend consome APIs reais.
- BI consome camada estável, não tabelas operacionais frágeis.
- Logs, métricas e auditoria mínima estão disponíveis.
- Existe documentação técnica, runbook e manual operacional.

## 14. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Modelo de dados mal definido | Alto | Fechar modelo lógico antes de implementação pesada. |
| Engine acoplada à UI ou API | Alto | Isolar engine em pacote/serviço próprio. |
| Ingestão virar upload manual de planilha | Alto | Criar pipeline com staging, validação, quarentena e promoção. |
| Parâmetros sem versionamento | Alto | Usar `engine_param_sets` versionado e referenciado em cada execução. |
| QA apenas manual no final | Médio/Alto | Criar unit, golden, contract, integration e E2E tests desde o início. |
| Migração V1 -> V2 subestimada | Médio | Mapear campos e criar script de migração cedo. |
| BigQuery usado como banco operacional | Médio | Usar Postgres para transacional e BigQuery para analytics. |
| Auth caseiro sem revisão | Médio | Usar provedor gerenciado ou executar hardening formal. |
| Frontend novo antes dos contratos | Médio | Fechar OpenAPI e schemas antes de telas complexas. |

## 15. Próximos Artefatos Recomendados

Antes da implementação pesada, produzir:

1. `docs/adr/0001-repository-strategy.md`
2. `docs/adr/0002-data-platform.md`
3. `docs/adr/0003-engine-architecture.md`
4. `docs/api/openapi.yaml`
5. `docs/data-model/modelo-logico-v2.md`
6. `docs/data-model/migracao-v1-v2.md`
7. `docs/runbooks/operacao-inicial.md`

Esses artefatos devem orientar os agentes antes de mudanças estruturais em código, schema ou infraestrutura.
