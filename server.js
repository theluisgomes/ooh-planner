require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bigQueryService = require('./services/bigquery-service');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database/ooh_planner.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inicializar banco de dados
let db;
try {
    db = new Database(DB_PATH, { readonly: true });
    console.log('✅ Conectado ao banco de dados');
} catch (err) {
    console.error('❌ Erro ao conectar ao banco de dados:', err.message);
    console.error('💡 Execute: npm run import');
    process.exit(1);
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /api/filters
 * Retorna valores únicos para cada filtro
 */
app.get('/api/filters', (req, res) => {
    try {
        const filters = {
            uf: db.prepare('SELECT DISTINCT uf FROM inventory WHERE uf IS NOT NULL ORDER BY uf').all().map(r => r.uf),
            praca: db.prepare('SELECT DISTINCT praca FROM inventory WHERE praca IS NOT NULL ORDER BY praca').all().map(r => r.praca),
            taxonomia: db.prepare('SELECT DISTINCT taxonomia FROM inventory WHERE taxonomia IS NOT NULL ORDER BY taxonomia').all().map(r => r.taxonomia),
            exibidores: db.prepare('SELECT DISTINCT exibidores FROM inventory WHERE exibidores IS NOT NULL ORDER BY exibidores').all().map(r => r.exibidores),
            formato: db.prepare('SELECT DISTINCT formato FROM inventory WHERE formato IS NOT NULL ORDER BY formato').all().map(r => r.formato),
            digital: ['Tudo', 'Sim', 'Não'],
            estatico: ['Tudo', 'Sim', 'Não']
        };

        res.json(filters);
    } catch (err) {
        console.error('Erro ao buscar filtros:', err);
        res.status(500).json({ error: 'Erro ao buscar filtros' });
    }
});

/**
 * POST /api/filters/available
 * Retorna valores disponíveis para cada filtro baseado nas seleções atuais
 */
app.post('/api/filters/available', (req, res) => {
    try {
        const { filters } = req.body;

        const fields = ['uf', 'praca', 'taxonomia', 'exibidores', 'formato'];
        const availableOptions = {};

        fields.forEach(field => {
            let query = `SELECT DISTINCT ${field} FROM inventory WHERE ${field} IS NOT NULL`;
            const params = [];

            fields.forEach(otherField => {
                if (field !== otherField && filters[otherField] && filters[otherField] !== 'Tudo') {
                    query += ` AND ${otherField} = ?`;
                    params.push(filters[otherField]);
                }
            });

            if (filters.digital && filters.digital !== 'Tudo') {
                query += ' AND digital = ?';
                params.push(filters.digital === 'Sim' ? 1 : 0);
            }

            if (filters.estatico && filters.estatico !== 'Tudo') {
                query += ' AND estatico = ?';
                params.push(filters.estatico === 'Sim' ? 1 : 0);
            }

            query += ` ORDER BY ${field}`;
            availableOptions[field] = db.prepare(query).all(...params).map(r => r[field]);
        });

        res.json(availableOptions);
    } catch (err) {
        console.error('Erro ao buscar filtros disponíveis:', err);
        res.status(500).json({ error: 'Erro ao buscar filtros disponíveis' });
    }
});

/**
 * POST /api/calculate
 * Calcula totais baseado em filtros e inputs do usuário
 */
app.post('/api/calculate', (req, res) => {
    try {
        const { filters, seletor_qtd, seletor_desc } = req.body;

        // Validação
        if (seletor_qtd === null || seletor_qtd === undefined || seletor_qtd < 0) {
            return res.json({
                status: 'error',
                message: 'Quantidade não definida',
                total_liquido: null
            });
        }

        if (seletor_desc === null || seletor_desc === undefined || seletor_desc < 0 || seletor_desc > 1) {
            return res.json({
                status: 'error',
                message: 'Desconto inválido (deve estar entre 0 e 1)',
                total_liquido: null
            });
        }

        // Construir query dinâmica
        let query = 'SELECT * FROM inventory WHERE 1=1';
        const params = [];

        if (filters.uf && filters.uf !== 'Tudo') {
            query += ' AND uf = ?';
            params.push(filters.uf);
        }

        if (filters.praca && filters.praca !== 'Tudo') {
            query += ' AND praca = ?';
            params.push(filters.praca);
        }

        if (filters.taxonomia && filters.taxonomia !== 'Tudo') {
            query += ' AND taxonomia = ?';
            params.push(filters.taxonomia);
        }

        if (filters.exibidores && filters.exibidores !== 'Tudo') {
            query += ' AND exibidores = ?';
            params.push(filters.exibidores);
        }

        if (filters.formato && filters.formato !== 'Tudo') {
            query += ' AND formato = ?';
            params.push(filters.formato);
        }

        if (filters.digital && filters.digital !== 'Tudo') {
            query += ' AND digital = ?';
            params.push(filters.digital === 'Sim' ? 1 : 0);
        }

        if (filters.estatico && filters.estatico !== 'Tudo') {
            query += ' AND estatico = ?';
            params.push(filters.estatico === 'Sim' ? 1 : 0);
        }

        // Executar query
        const stmt = db.prepare(query);
        const results = stmt.all(...params);

        if (results.length === 0) {
            return res.json({
                status: 'error',
                message: 'Nenhum dado encontrado para os filtros selecionados',
                total_liquido: null
            });
        }

        // Agregar resultados (usar primeiro registro como referência)
        const item = results[0];
        const preco_unit = item.unitario_bruto_tabela;
        const total_bruto = seletor_qtd * preco_unit;
        const total_liquido = total_bruto * (1 - seletor_desc);

        // Guardrails
        const minimo = item.range_minimo;
        const maximo = item.range_maximo;

        // Validar guardrails
        let warning = null;
        if (minimo && seletor_qtd < minimo) {
            warning = `Quantidade abaixo do mínimo recomendado (${minimo})`;
        } else if (maximo && seletor_qtd > maximo) {
            warning = `Quantidade acima do máximo recomendado (${maximo})`;
        }

        // Indicadores - Estimativas baseadas em dados disponíveis
        // Como exposicao_unit e impacto_unit estão vazios, criamos estimativas
        let exposicao_estimada = null;
        let eficiencia = null;
        let impacto_estimado = null;

        // Fator de exposição baseado no formato (pessoas expostas por unidade)
        const getExposureFactor = (formato, digital, estatico) => {
            const formatoLower = (formato || '').toLowerCase();

            // Formatos de alto impacto (grandes, alta visibilidade)
            if (formatoLower.includes('empena') || formatoLower.includes('painel')) return 50000;
            if (formatoLower.includes('metro') || formatoLower.includes('metrô')) return 45000;
            if (formatoLower.includes('aeroporto')) return 40000;
            if (formatoLower.includes('shopping')) return 35000;
            if (formatoLower.includes('parque')) return 30000;

            // Formatos de médio impacto
            if (formatoLower.includes('abrigo') || formatoLower.includes('onibus') || formatoLower.includes('ônibus')) {
                return digital ? 25000 : 20000;
            }
            if (formatoLower.includes('mub') || formatoLower.includes('banca')) return 22000;
            if (formatoLower.includes('totem')) return digital ? 28000 : 18000;
            if (formatoLower.includes('circuito')) return 20000;

            // Formatos específicos de veículos
            if (formatoLower.includes('backbus') || formatoLower.includes('back bus')) return 18000;
            if (formatoLower.includes('backseat') || formatoLower.includes('back seat')) return 8000;
            if (formatoLower.includes('envelopamento')) return 35000;
            if (formatoLower.includes('exterior')) return 25000;

            // Default: formato padrão
            return digital ? 15000 : 12000;
        };

        // Calcular estimativas
        const exposureFactor = getExposureFactor(item.formato, item.digital, item.estatico);
        exposicao_estimada = seletor_qtd * exposureFactor;

        // Impacto estimado (percentual de pessoas que realmente prestam atenção)
        // Geralmente 10-30% da exposição, dependendo do formato
        const impactRate = item.digital ? 0.25 : 0.15; // Digital tem mais impacto
        impacto_estimado = exposicao_estimada * impactRate;

        // Eficiência: exposição por real investido (quanto maior, melhor)
        // Valores típicos: 50-500 (exposições por real)
        if (total_liquido > 0) {
            eficiencia = exposicao_estimada / total_liquido;
        }

        res.json({
            status: 'success',
            total_bruto,
            total_liquido,
            minimo,
            maximo,
            warning,
            exposicao_estimada,
            eficiencia,
            impacto_estimado,
            preco_unit,
            records_found: results.length,
            // Indicar que são estimativas
            is_estimated: true,
            exposure_factor: exposureFactor
        });

    } catch (err) {
        console.error('Erro ao calcular:', err);
        res.status(500).json({
            status: 'error',
            error: 'Erro ao calcular totais',
            message: err.message
        });
    }
});

/**
 * POST /api/inventory
 * Retorna inventário filtrado (para tabela consolidada)
 */
app.post('/api/inventory', (req, res) => {
    try {
        const { filters } = req.body;

        let query = 'SELECT * FROM inventory WHERE 1=1';
        const params = [];

        // Aplicar filtros (mesmo código do /calculate)
        if (filters.uf && filters.uf !== 'Tudo') {
            query += ' AND uf = ?';
            params.push(filters.uf);
        }

        if (filters.praca && filters.praca !== 'Tudo') {
            query += ' AND praca = ?';
            params.push(filters.praca);
        }

        if (filters.taxonomia && filters.taxonomia !== 'Tudo') {
            query += ' AND taxonomia = ?';
            params.push(filters.taxonomia);
        }

        if (filters.exibidores && filters.exibidores !== 'Tudo') {
            query += ' AND exibidores = ?';
            params.push(filters.exibidores);
        }

        if (filters.formato && filters.formato !== 'Tudo') {
            query += ' AND formato = ?';
            params.push(filters.formato);
        }

        if (filters.digital && filters.digital !== 'Tudo') {
            query += ' AND digital = ?';
            params.push(filters.digital === 'Sim' ? 1 : 0);
        }

        if (filters.estatico && filters.estatico !== 'Tudo') {
            query += ' AND estatico = ?';
            params.push(filters.estatico === 'Sim' ? 1 : 0);
        }

        query += ' LIMIT 100'; // Limitar resultados

        const stmt = db.prepare(query);
        const results = stmt.all(...params);

        res.json(results);

    } catch (err) {
        console.error('Erro ao buscar inventário:', err);
        res.status(500).json({ error: 'Erro ao buscar inventário' });
    }
});

/**
 * GET /api/stats
 * Retorna estatísticas do banco de dados
 */
app.get('/api/stats', (req, res) => {
    try {
        const stats = {
            total_records: db.prepare('SELECT COUNT(*) as count FROM inventory').get().count,
            total_ufs: db.prepare('SELECT COUNT(DISTINCT uf) as count FROM inventory').get().count,
            total_pracas: db.prepare('SELECT COUNT(DISTINCT praca) as count FROM inventory').get().count,
            total_formatos: db.prepare('SELECT COUNT(DISTINCT formato) as count FROM inventory').get().count
        };

        res.json(stats);
    } catch (err) {
        console.error('Erro ao buscar estatísticas:', err);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

/**
 * POST /api/bigquery/store
 * Store planning data to BigQuery
 */
app.post('/api/bigquery/store', async (req, res) => {
    try {
        const { activeBlocks, totalBudget } = req.body;

        // Validate input
        if (!activeBlocks || !Array.isArray(activeBlocks) || activeBlocks.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No active blocks provided'
            });
        }

        // Store data to BigQuery
        const result = await bigQueryService.storePlanningData({
            activeBlocks,
            totalBudget
        });

        res.json(result);

    } catch (err) {
        console.error('Error storing to BigQuery:', err);
        res.status(500).json({
            success: false,
            error: err.message || 'Failed to store data to BigQuery'
        });
    }
});

/**
 * GET /api/bigquery/test
 * Test BigQuery connection
 */
app.get('/api/bigquery/test', async (req, res) => {
    try {
        const isConnected = await bigQueryService.testConnection();

        if (isConnected) {
            res.json({
                success: true,
                message: 'BigQuery connection successful'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'BigQuery connection failed'
            });
        }
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================================
// SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 API disponível em http://localhost:${PORT}/api`);
    console.log(`\n💡 Endpoints disponíveis:`);
    console.log(`   GET  /api/filters  - Lista de filtros disponíveis`);
    console.log(`   POST /api/calculate - Calcular totais`);
    console.log(`   POST /api/inventory - Buscar inventário`);
    console.log(`   GET  /api/stats - Estatísticas do banco`);
    console.log(`   POST /api/bigquery/store - Armazenar dados no BigQuery`);
    console.log(`   GET  /api/bigquery/test - Testar conexão BigQuery\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Encerrando servidor...');
    db.close();
    process.exit(0);
});
