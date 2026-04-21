require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
// const Database = require('better-sqlite3'); // Removed for BigQuery migration
const bigQueryService = require('./services/bigquery-service');
const sqliteService = require('./services/sqlite-service'); // Fallback
const authService = require('./services/auth-service');

const app = express();
const PORT = process.env.PORT || 3001;
// const DB_PATH = path.join(__dirname, 'database/ooh_planner.db'); // Removed

// Initialize Auth Service
authService.initialize();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing form data
app.use(express.static('public'));

// Session Middleware
app.use(session({
    secret: 'boticario_ooh_planner_secret_key_change_in_prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Auth Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Please log in' });
};

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
// AUTH ENDPOINTS
// ============================================

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const user = authService.verifyUser(username, password);

    if (user) {
        req.session.user = { id: user.id, username: user.username };
        res.json({ success: true, user: req.session.user });
    } else {
        res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }
});

app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    }

    try {
        const userId = authService.createUser(username, password);
        // Auto login after signup
        req.session.user = { id: userId, username };
        res.json({ success: true, message: 'Usuário criado com sucesso!', user: req.session.user });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ success: false, message: 'Usuário já existe' });
        }
        res.status(500).json({ success: false, message: 'Erro ao criar usuário' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /api/filters
 * Retorna valores únicos para cada filtro
 */
app.get('/api/filters', isAuthenticated, async (req, res) => {
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
app.post('/api/filters/available', isAuthenticated, async (req, res) => {
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
app.post('/api/calculate', isAuthenticated, async (req, res) => {
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
app.post('/api/optimize-budget', isAuthenticated, async (req, res) => {
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
 * POST /api/get-ideal-plan
 * NEW: Get ideal plan recommendation based on 4 core inputs
 * Returns format-level recommendations with quantities
 */
app.post('/api/get-ideal-plan', isAuthenticated, async (req, res) => {
    try {
        const { budget, campaignCycle, taxonomia, praca } = req.body;

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

        if (!taxonomia) {
            return res.json({
                status: 'error',
                message: 'Taxonomia não definida'
            });
        }

        if (!praca) {
            return res.json({
                status: 'error',
                message: 'Praça não definida'
            });
        }

        // Get full inventory
        const inventory = await dataService.getInventory({});

        // Generate ideal plan
        const recommendationService = require('./services/recommendation-service');
        const idealPlan = recommendationService.getIdealPlan(
            budget,
            campaignCycle,
            taxonomia,
            praca,
            inventory
        );

        res.json(idealPlan);

    } catch (err) {
        console.error('Erro ao gerar plano ideal:', err);
        res.status(500).json({
            status: 'error',
            error: 'Erro ao gerar plano ideal',
            message: err.message
        });
    }
});

/**
 * POST /api/calculate-efficiency
 * NEW: Calculate efficiency metrics comparing manual vs ideal plan
 */
app.post('/api/calculate-efficiency', isAuthenticated, async (req, res) => {
    try {
        const { manualPlan, idealPlan } = req.body;

        if (!manualPlan || !idealPlan) {
            return res.status(400).json({
                status: 'error',
                message: 'Manual plan e ideal plan são obrigatórios'
            });
        }

        const recommendationService = require('./services/recommendation-service');
        const efficiency = recommendationService.calculateEfficiency(manualPlan, idealPlan);

        res.json(efficiency);

    } catch (err) {
        console.error('Erro ao calcular eficiência:', err);
        res.status(500).json({
            status: 'error',
            error: 'Erro ao calcular eficiência',
            message: err.message
        });
    }
});

/**
 * POST /api/get-player-list
 * NEW: Generate detailed player/format list based on manual adjustments
 */
app.post('/api/get-player-list', isAuthenticated, async (req, res) => {
    try {
        const { manualPlan, idealPlan } = req.body;

        if (!manualPlan || !idealPlan) {
            return res.status(400).json({
                status: 'error',
                message: 'Manual plan e ideal plan são obrigatórios'
            });
        }

        const recommendationService = require('./services/recommendation-service');
        const playerList = recommendationService.generatePlayerList(manualPlan, idealPlan);

        res.json({
            status: 'success',
            playerList
        });

    } catch (err) {
        console.error('Erro ao gerar lista de players:', err);
        res.status(500).json({
            status: 'error',
            error: 'Erro ao gerar lista de players',
            message: err.message
        });
    }
});

/**
 * POST /api/get-planning-data
 * Returns inventory grouped by exibidor+formato for the planning table
 */
app.post('/api/get-planning-data', isAuthenticated, async (req, res) => {
    try {
        const { taxonomia, praca, formato, exibidores } = req.body;

        if (!taxonomia || !praca) {
            return res.status(400).json({
                status: 'error',
                message: 'Taxonomia e Praça são obrigatórios'
            });
        }

        // Get filtered inventory
        const filters = { taxonomia, praca };
        if (formato) filters.formato = formato;
        if (exibidores) filters.exibidores = exibidores;
        const inventory = await dataService.getInventory(filters);

        if (!inventory || inventory.length === 0) {
            return res.json({
                status: 'success',
                rows: [],
                message: 'Nenhum inventário encontrado'
            });
        }

        // Detect circuit/package rows:
        // A row is a circuit if it has a circuito field, if formato contains 'circuito', 'pacote', or
        // 'full', OR if quantidade == 1 while range_minimo == range_maximo and that value > 1
        // (meaning 1 buyable unit = many faces).
        const detectCircuito = (item) => {
            if (item.circuito) return item.circuito;
            const fLower = (item.formato || '').toLowerCase();
            if (fLower.includes('circuito') || fLower.includes('pacote') || fLower.includes(' full')) {
                return item.formato;
            }
            const rMin = item.range_minimo;
            const rMax = item.range_maximo;
            const qty = item.quantidade;
            if (qty === 1 && rMin > 1 && rMin === rMax) return item.formato;
            return null;
        };

        // Group by exibidores + formato + material type
        const groups = {};
        inventory.forEach(item => {
            const materialType = item.digital ? 'DIG' : (item.estatico ? 'EST' : 'N/A');
            const key = `${item.exibidores}|||${item.formato}|||${materialType}`;
            if (!groups[key]) {
                const detectedCircuito = detectCircuito(item);
                groups[key] = {
                    exibidores: item.exibidores,
                    formato: item.formato,
                    circuito: detectedCircuito,
                    ranking: item.ranking,
                    pesos: item.pesos,
                    periodicidade: item.periodicidade || null,
                    digital: 0,
                    estatico: 0,
                    totalFaces: 0,
                    s1: 0,
                    s2: 0,
                    s3: 0,
                    s4: 0,
                    unitario_bruto_tabela: 0,
                    desconto: 0,
                    unitario_bruto_negociado: 0,
                    total_bruto_negociado: 0,
                    exposicao_unit: 0,
                    impacto_unit: 0,
                    range_minimo: 0,
                    range_maximo: 0,
                    cpf_min_neg: Infinity,
                    cpf_max_tab: 0,
                    count: 0
                };
            }
            const g = groups[key];
            if (!g.circuito) {
                g.circuito = detectCircuito(item);
            }
            g.totalFaces += (item.quantidade || 0);
            g.s1 += (item.s1 || 0);
            g.s2 += (item.s2 || 0);
            g.s3 += (item.s3 || 0);
            g.s4 += (item.s4 || 0);
            g.digital = Math.max(g.digital, item.digital || 0);
            g.estatico = Math.max(g.estatico, item.estatico || 0);
            g.unitario_bruto_tabela += (item.unitario_bruto_tabela || 0);
            g.desconto += (item.desconto || 0);
            g.unitario_bruto_negociado += (item.unitario_bruto_negociado || 0);
            g.total_bruto_negociado += (item.total_bruto_negociado || 0);
            g.exposicao_unit += (item.exposicao_unit || 0);
            g.impacto_unit += (item.impacto_unit || 0);
            g.range_minimo += (item.range_minimo || 0);
            g.range_maximo += (item.range_maximo || 0);
            // Track true min/max cost-per-face across grouped records
            if (item.unitario_bruto_negociado > 0) g.cpf_min_neg = Math.min(g.cpf_min_neg, item.unitario_bruto_negociado);
            if (item.unitario_bruto_tabela > 0) g.cpf_max_tab = Math.max(g.cpf_max_tab, item.unitario_bruto_tabela);
            g.count++;
        });

        // Convert to array and compute averages
        const rows = Object.values(groups).map(g => {
            const avgTabela = g.count > 0 ? g.unitario_bruto_tabela / g.count : 0;
            const avgDesconto = g.count > 0 ? g.desconto / g.count : 0;
            const avgNegociado = g.count > 0 ? g.unitario_bruto_negociado / g.count : 0;
            // cpf: use the true min (lowest negotiated price) and max (highest table price) across records
            const cpfMin = g.cpf_min_neg === Infinity ? avgNegociado : g.cpf_min_neg;
            const cpfMax = g.cpf_max_tab > 0 ? g.cpf_max_tab : avgTabela;
            const index = g.totalFaces * (g.pesos || 0.5);

            // For circuit/package rows, the base purchase unit contains `range_maximo` faces.
            // e.g. Salvador "Pacote Full": range_min = range_max = 63 → 1 circuit = 63 faces.
            // For unitary rows, each face is an independent purchase unit → fpu = 1.
            let facesPorUnidade = 1;
            if (g.circuito && g.range_maximo > 0) {
                // Per group, range_maximo was summed across records; divide back by count.
                facesPorUnidade = Math.round(g.range_maximo / g.count);
                if (facesPorUnidade < 1) facesPorUnidade = 1;
            }

            return {
                exibidores: g.exibidores,
                formato: g.formato,
                circuito: g.circuito,
                ranking: g.ranking,
                pesos: g.pesos,
                periodicidade: g.periodicidade,
                totalFaces: g.totalFaces,
                index: Math.round(index * 100) / 100,
                digital: g.digital,
                estatico: g.estatico,
                s1: g.s1,
                s2: g.s2,
                s3: g.s3,
                s4: g.s4,
                unitario_bruto_tabela: Math.round(avgTabela * 100) / 100,
                desconto: Math.round(avgDesconto * 100) / 100,
                unitario_bruto_negociado: Math.round(avgNegociado * 100) / 100,
                total_bruto_negociado: Math.round(g.total_bruto_negociado * 100) / 100,
                exposicao_unit: g.exposicao_unit,
                impacto_unit: g.impacto_unit,
                range_minimo: g.range_minimo,
                range_maximo: g.range_maximo,
                cpf_minimo: Math.round(cpfMin * 100) / 100,
                cpf_maximo: Math.round(cpfMax * 100) / 100,
                faces_por_unidade: Math.round(facesPorUnidade)
            };
        });

        // Sort by ranking (lower = higher priority)
        rows.sort((a, b) => (a.ranking || 99) - (b.ranking || 99));

        res.json({
            status: 'success',
            rows,
            totalRows: rows.length,
            totalFaces: rows.reduce((s, r) => s + r.totalFaces, 0)
        });

    } catch (err) {
        console.error('Erro ao buscar planning data:', err);
        res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
});

/**
 * POST /api/inventory
 * Retorna inventário filtrado (para tabela consolidada)
 */
app.post('/api/inventory', isAuthenticated, async (req, res) => {
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
app.get('/api/stats', isAuthenticated, async (req, res) => {
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
app.post('/api/bigquery/store', isAuthenticated, async (req, res) => {
    try {
        const { activeBlocks, totalBudget, planName } = req.body;

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
            totalBudget,
            planName
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
 * POST /api/plans
 * Save a plan to the local user database
 */
app.post('/api/plans', isAuthenticated, (req, res) => {
    try {
        const { name, data } = req.body;
        const userId = req.session.user.id;

        if (!name || !data) {
            return res.status(400).json({ success: false, message: 'Plan Name and Data are required' });
        }

        const planId = authService.savePlan(userId, name, data);
        res.json({ success: true, message: 'Plano salvo com sucesso!', planId });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao salvar plano' });
    }
});

/**
 * GET /api/plans
 * List plans for the current user
 */
app.get('/api/plans', isAuthenticated, (req, res) => {
    try {
        const userId = req.session.user.id;
        const plans = authService.getUserPlans(userId);
        res.json({ success: true, plans });
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar planos' });
    }
});

/**
 * GET /api/plans/:id
 * Get a specific plan
 */
app.get('/api/plans/:id', isAuthenticated, (req, res) => {
    try {
        const planId = req.params.id;
        const plan = authService.getPlanById(planId);

        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plano não encontrado' });
        }

        // Verify ownership (optional but recommended)
        if (plan.user_id !== req.session.user.id) {
            return res.status(403).json({ success: false, message: 'Acesso negado' });
        }

        res.json({ success: true, plan });
    } catch (error) {
        console.error('Error fetching plan:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar plano details' });
    }
});

/**
 * GET /api/bigquery/test
 * Test BigQuery connection
 */
app.get('/api/bigquery/test', isAuthenticated, async (req, res) => {
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
