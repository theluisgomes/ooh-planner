require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
// const Database = require('better-sqlite3'); // Removed for BigQuery migration
const bigQueryService = require('./services/bigquery-service');
const sqliteService = require('./services/sqlite-service'); // Fallback

const app = express();
const PORT = process.env.PORT || 3000;
// const DB_PATH = path.join(__dirname, 'database/ooh_planner.db'); // Removed

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inicializar banco de dados
// Migration to BigQuery: We assume BigQuery service handles connection natively
console.log('✅ Configurado para usar BigQuery (com fallback SQLite)');

// Determine which service to use
let dataService = bigQueryService;
let usingSQLiteFallback = false;

// Try to initialize BigQuery, fallback to SQLite if it fails
(async () => {
    try {
        await bigQueryService.initialize();
        console.log('✅ BigQuery conectado com sucesso');
    } catch (error) {
        console.warn('⚠️  BigQuery indisponível, usando SQLite local');
        dataService = sqliteService;
        usingSQLiteFallback = true;
        await sqliteService.initialize();
    }
})();

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /api/filters
 * Retorna valores únicos para cada filtro
 */
app.get('/api/filters', async (req, res) => {
    try {
        const filters = await dataService.getFilters();
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
app.post('/api/filters/available', async (req, res) => {
    try {
        const { filters } = req.body;
        const availableOptions = await dataService.getAvailableFilters(filters);
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
app.post('/api/calculate', async (req, res) => {
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

        const result = await dataService.calculate(filters, seletor_qtd, seletor_desc);
        res.json(result);

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
 * POST /api/optimize-budget
 * NEW: Budget-driven optimization endpoint
 * Receives budget and campaign cycle, returns optimal face allocation
 */
app.post('/api/optimize-budget', async (req, res) => {
    try {
        const { budget, campaignCycle, filters = {} } = req.body;

        // Validation
        if (!budget || budget <= 0) {
            return res.json({
                status: 'error',
                message: 'Budget não definido ou inválido'
            });
        }

        if (!campaignCycle || campaignCycle <= 0) {
            return res.json({
                status: 'error',
                message: 'Ciclo de campanha não definido ou inválido'
            });
        }

        // Get filtered inventory from data service
        const inventory = await dataService.getInventory(filters);

        // Optimize budget allocation
        const budgetOptimizer = require('./services/budget-optimizer');
        const result = budgetOptimizer.optimizeAllocation(budget, campaignCycle, inventory);

        res.json(result);

    } catch (err) {
        console.error('Erro ao otimizar budget:', err);
        res.status(500).json({
            status: 'error',
            error: 'Erro ao otimizar alocação de budget',
            message: err.message
        });
    }
});

/**
 * POST /api/inventory
 * Retorna inventário filtrado (para tabela consolidada)
 */
app.post('/api/inventory', async (req, res) => {
    try {
        const { filters } = req.body;
        const results = await dataService.getInventory(filters);
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
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await dataService.getStats();
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
    console.log(`   POST /api/optimize-budget - Otimizar alocação de budget (NEW)`);
    console.log(`   POST /api/inventory - Buscar inventário`);
    console.log(`   GET  /api/stats - Estatísticas do banco`);
    console.log(`   POST /api/bigquery/store - Armazenar dados no BigQuery`);
    console.log(`   GET  /api/bigquery/test - Testar conexão BigQuery\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Encerrando servidor...');
    // db.close(); // Migrated to BigQuery, no DB connection to close
    process.exit(0);
});
