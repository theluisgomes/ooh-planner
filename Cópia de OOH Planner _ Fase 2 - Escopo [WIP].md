

| Projeto | OOH Planner / Fase 2 |
| :---- | :---- |
| **Cliente** | AlmapBBDO/Grupo Boticário |
| **Data** | 04/12/2025 |
| **Versão** | v1 |
| **Status** | Work in progress |

## **Objetivo**

Entregar o módulo operacional do OOH Planner: um aplicativo web completo e validado, composto por input, orientações calibradas, versionamento, motor de regras, armazenamento dos resultados-calibrados e integração com o dashboard analítico.

Este documento detalha todo o escopo, etapas, entregáveis e responsabilidades.

## **Visão geral da arquitetura**

A solução integra quatro camadas:

1. Base orientadora (dados fixos migrados do Excel)  
2. Aplicativo web (input \+ orientador)  
3. Motor de regras (cálculos, validações, resultados-calibrados)  
4. Dashboard analítico (planejado vs calibrado)

Essa jornada está representada no fluxo do documento de requisitos (p. 9).

## **Escopo funcional**

### **Módulo orientador (calibrador)**

O app deve exibir:

* Ranges mínimos e máximos por praça  
* Recomendações orientadoras  
* Indicadores visuais de Exposição e Eficiência  
* Alertas de inconsistência de input  
* Feedback dinâmico pós-input (“under / fit / over”)

### **Módulo de input e versionamento**

Funcionalidades:

* Criar planejamento  
* Editar planejamento  
* Salvar versões  
* Histórico por usuário e por praça  
* Rastreabilidade completa

### **Motor de regras e resultados-calibrados**

O back-end deve:

* Validar input conforme ranges  
* Calcular indicadores (Exposição, Eficiência, Aderência)  
* Gerar tabela completa de resultados pós-processamento  
* Expor APIs para o dashboard

### **Banco de dados (3 camadas)**

1. Tabela orientadora  
2. Tabela de inputs  
3. Tabela de resultados-calibrados

Com requisitos de:

* Governança  
* Histórico de versões  
* Auditoria

### **Front-end (aplicativo web)**

Telas necessárias:

* Login  
* Seleção de praça  
* Tela do orientador (ranges \+ indicadores)  
* Tela de input  
* Tela de feedback processado  
* Tela de versões/histórico

### **Integração com dashboard analítico**

O dashboard deve:

* Ler inputs \+ resultados-calibrados  
* Comparar planejado vs calibrado  
* Mostrar exposição/eficiência por praça  
* Gerar visão executiva

## **Documentação**

A Fase 2 incluirá todo o pacote de documentação, dividido em três categorias:

### **Documentação técnica de desenvolvimento**

Documento destinado ao time técnico, contendo:

* Arquitetura final da solução  
* Estrutura do banco de dados (tabelas, relacionamentos, chaves)  
* Modelos de dados  
* Descrição completa das APIs  
* Regras implementadas no motor de calibração  
* Fluxos de input → processamento → armazenamento  
* Detalhamento de integrações com Power BI  
* Padrões de autenticação e segurança  
* Infraestrutura e ambiente (Azure)

Formato: PDF ou Confluence técnico  
Responsáveis: Tech Lead, Back-end, Dados

### **Documentação do usuário (manual do produto)**

Manual para usuários finais, com:

* Explicação do fluxo completo  
* Detalhamento de cada tela  
* Função de cada botão  
* Exemplos de input  
* Como interpretar indicadores de Exposição e Eficiência  
* Como criar, salvar, editar e versionar planejamentos  
* Procedimentos de erro e mensagens padrão  
* Guia de boas práticas

Formato: PDF  
Responsáveis: PM \+ UX/UI \+ QA

### **Documentação de testes**

Registro formal do que foi testado, incluindo:

### **a) Testes de desenvolvimento (Dev)**

* Testes unitários do motor de regras  
* Testes dos endpoints  
* Testes de autenticação  
* Testes de versionamento

### **b) Testes de dados**

* Validação das três camadas do banco  
* Testes de ingestão pelo dashboard  
* Validação de ranges, cálculos e consistência  
* Conferência de governança e logs

### **c) Testes de BI**

* Conexão banco → dashboard  
* Atualização automática  
* Cenários de planejamento vs calibrado  
* Verificação de inconsistências de indicadores

**Resultado:**  
 → Relatório de testes consolidado (PDF)  
Responsáveis: QA \+ Back-end \+ Eng. Dados \+ BI

## **Testes**

Além da documentação dos testes, a Fase 2 inclui a execução formal dos testes nas três frentes:

### **Testes de desenvolvimento (Dev)**

* Funcionamento das APIs  
* Performance do motor de regras  
* Versionamento correto  
* Segurança básica

### **Testes de dados**

* Integridade das tabelas  
* Cálculos de exposição/eficiência  
* Aderência aos ranges

### **Testes de BI**

* Visualização correta das informações  
* Alimentação das métricas  
* Sincronização dos dados

### **Testes de usuário (UAT)**

* Usuários fazem simulações reais  
* Validação do orientador  
* Teste da experiência de salvar/editar  
* Aprovação formal

## **Perfis necessários**

* Tech Lead / Arquiteto  
* Engenheiro(a) de Dados  
* Desenvolvedor(a) Full Stack  
* UX/UI Designer  
* QA  
* PM

## **Estimativa de esforço**

| Etapa | Horas |
| :---- | :---- |
| Blueprint Técnico | 70 h |
| UX/UI | 50 h |
| Backend | 160 h |
| Banco de Dados | 65 h |
| Frontend | 145 h |
| Integração BI | 40 h |
| Testes completos (Dev \+ Dados \+ BI \+ UAT) | 40 h |
| Documentação (Dev \+ Usuário \+ Testes) | 30 h |
| Go-Live & Handoff | 20 h |
| **Total Estimado** | **620 h** |

## **Investimento estimado**

Com base no valor-hora:  
→ R$ 150.000 – R$ 170.000  
 (depende da complexidade final da UI e das regras de calibração)

## **Entregáveis**

* Aplicativo Web completo  
* Orientador (ranges \+ indicadores)  
* Motor de regras  
* 3 tabelas do banco estruturadas  
* API de acesso ao dashboard  
* Dashboard analítico final  
* Documentação técnica completa  
* Manual do usuário  
* Relatório de testes (Dev \+ Dados \+ BI)  
* Go-Live \+ Treinamento

## **Cronograma Macro**

(10–14 semanas)

1. Blueprint Técnico (1–2)  
2. UX/UI (2–4)  
3. Back-end \+ Banco (4–7)  
4. Front-end (6–10)  
5. Integração BI (9–10)  
6. Testes (10–12)  
7. Documentação (11–13)  
8. Go-Live (12–14)  
