/**
 * BigQuery Service
 * Handles all BigQuery operations for storing OOH planning data
 */

const { BigQuery } = require('@google-cloud/bigquery');
const { config, validateConfig } = require('../config/bigquery-config');
const fs = require('fs');

const MEDIA_TABLE = 'media_inventory'; // Table for catalog data

class BigQueryService {
    constructor() {
        this.bigquery = null;
        this.dataset = null;
        this.table = null;
        this.initialized = false;
    }

    /**
     * Initialize BigQuery client and verify connection
     */
    async initialize() {
        try {
            // Validate configuration
            validateConfig();

            // Initialize BigQuery client
            // If keyFilename is provided and exists, use it
            // Otherwise, use Application Default Credentials
            const clientConfig = { projectId: config.projectId };

            if (config.keyFilename && fs.existsSync(config.keyFilename)) {
                console.log('🔑 Using Service Account key file');
                clientConfig.keyFilename = config.keyFilename;
            } else {
                console.log('🔑 Using Application Default Credentials');
                // No keyFilename - BigQuery client will automatically use ADC
            }

            this.bigquery = new BigQuery(clientConfig);

            // Get dataset reference
            this.dataset = this.bigquery.dataset(config.dataset);

            // Check if dataset exists
            const [datasetExists] = await this.dataset.exists();
            if (!datasetExists) {
                throw new Error(`Dataset '${config.dataset}' does not exist in project '${config.projectId}'`);
            }

            // Get or create table
            await this.ensureTableExists();

            this.initialized = true;
            console.log('✅ BigQuery service initialized successfully');
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize BigQuery service:', error.message);

            // Check for specific authentication errors
            if (error.message.includes('invalid_grant') ||
                (error.errors && error.errors.some(e => e.reason === 'invalid_grant'))) {

                console.error('\n⚠️  AUTHENTICATION ERROR: Your Google Cloud credentials have expired or are invalid.');
                console.error('   Please run the following command in your terminal to re-authenticate:');
                console.error('   👉 gcloud auth application-default login');
                console.error('\n   Alternatively, download a Service Account Key JSON file and place it at:');
                console.error('   👉 config/bigquery-key.json\n');
            }

            throw error;
        }
    }

    /**
     * Ensure the table exists with the correct schema
     */
    async ensureTableExists() {
        this.table = this.dataset.table(config.table);
        const [tableExists] = await this.table.exists();

        if (!tableExists) {
            console.log(`📋 Creating table '${config.table}'...`);

            const schema = [
                { name: 'session_id', type: 'STRING', mode: 'REQUIRED' },
                { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
                { name: 'plan_name', type: 'STRING', mode: 'NULLABLE' },
                { name: 'version', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'block_id', type: 'INTEGER', mode: 'REQUIRED' },
                { name: 'uf', type: 'STRING', mode: 'NULLABLE' },
                { name: 'praca', type: 'STRING', mode: 'NULLABLE' },
                { name: 'taxonomia', type: 'STRING', mode: 'NULLABLE' },
                { name: 'exibidores', type: 'STRING', mode: 'NULLABLE' },
                { name: 'formato', type: 'STRING', mode: 'NULLABLE' },
                { name: 'digital', type: 'STRING', mode: 'NULLABLE' },
                { name: 'estatico', type: 'STRING', mode: 'NULLABLE' },
                { name: 'quantidade', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'desconto', type: 'FLOAT', mode: 'NULLABLE' },
                { name: 'total_liquido', type: 'FLOAT', mode: 'NULLABLE' },
                { name: 'total_bruto', type: 'FLOAT', mode: 'NULLABLE' },
                { name: 'preco_unitario', type: 'FLOAT', mode: 'NULLABLE' },
                { name: 'minimo', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'maximo', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'warning', type: 'STRING', mode: 'NULLABLE' },
                { name: 'exposicao_estimada', type: 'FLOAT', mode: 'NULLABLE' },
                { name: 'eficiencia', type: 'FLOAT', mode: 'NULLABLE' },
                { name: 'records_found', type: 'INTEGER', mode: 'NULLABLE' }
            ];

            const options = {
                schema: schema,
                location: 'US'
            };

            await this.dataset.createTable(config.table, options);
            console.log(`✅ Table '${config.table}' created successfully`);
        } else {
            console.log(`✅ Table '${config.table}' already exists`);
            // Note: If you need to add columns to an existing table, you would do it here using table.getMetadata() and checking schema
        }
    }

    /**
     * Get the next version number for a given plan name
     */
    async getNextVersion(planName) {
        if (!planName) return 1;

        const query = `
            SELECT MAX(version) as max_version
            FROM \`${config.projectId}.${config.dataset}.${config.table}\`
            WHERE plan_name = @planName
        `;

        try {
            const [rows] = await this.bigquery.query({
                query,
                params: { planName }
            });

            const maxVersion = rows[0]?.max_version || 0;
            return maxVersion + 1;
        } catch (error) {
            // If table doesn't exist or other error, assume version 1
            console.warn('Error fetching version, defaulting to 1:', error.message);
            return 1;
        }
    }

    /**
     * Store planning data to BigQuery
     * @param {Object} planningData - The planning data from the frontend
     * @returns {Promise<Object>} - Result of the insert operation
     */
    async storePlanningData(planningData) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { activeBlocks, totalBudget, planName } = planningData;

            if (!activeBlocks || activeBlocks.length === 0) {
                throw new Error('No active blocks to store');
            }

            // Determine version
            const version = await this.getNextVersion(planName);

            // Generate unique session ID
            const sessionId = this.generateSessionId();
            const timestamp = new Date().toISOString();

            // Transform data to match BigQuery schema (flat structure)
            const rows = activeBlocks.map(block => ({
                session_id: sessionId,
                timestamp: timestamp,
                plan_name: planName || 'Untitled Plan',
                version: version,
                block_id: block.id,
                uf: block.filters.uf || null,
                praca: block.filters.praca || null,
                taxonomia: block.filters.taxonomia || null,
                exibidores: block.filters.exibidores || null,
                formato: block.filters.formato || null,
                digital: block.filters.digital || null,
                estatico: block.filters.estatico || null,
                quantidade: block.seletor_qtd || null,
                desconto: block.seletor_desc || null,
                total_liquido: block.result?.total_liquido || null,
                total_bruto: block.result?.total_bruto || null,
                preco_unitario: block.result?.preco_unit || null,
                minimo: block.result?.minimo || null,
                maximo: block.result?.maximo || null,
                warning: block.result?.warning || null,
                exposicao_estimada: block.result?.exposicao_estimada || null,
                eficiencia: block.result?.eficiencia || null,
                records_found: block.result?.records_found || null
            }));

            // Insert rows into BigQuery
            await this.table.insert(rows);

            console.log(`✅ Successfully stored ${rows.length} blocks to BigQuery`);
            console.log(`   Session ID: ${sessionId}`);
            console.log(`   Plan: ${planName} (v${version})`);
            console.log(`   Total Budget: R$ ${totalBudget.toFixed(2)}`);

            return {
                success: true,
                sessionId,
                rowsInserted: rows.length,
                timestamp,
                planName,
                version
            };

        } catch (error) {
            console.error('❌ Error storing data to BigQuery:', error);

            // Provide more specific error messages
            if (error.code === 404) {
                throw new Error('Table or dataset not found. Please verify your BigQuery configuration.');
            } else if (error.code === 403) {
                throw new Error('Permission denied. Please check your service account permissions.');
            } else {
                throw new Error(`Failed to store data: ${error.message}`);
            }
        }
    }

    /**
     * Generate a unique session ID
     * @returns {string} - Unique session identifier
     */
    generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `session_${timestamp}_${random}`;
    }

    /**
     * Test BigQuery connection
     * @returns {Promise<boolean>}
     */
    async testConnection() {
        try {
            await this.initialize();
            return true;
        } catch (error) {
            console.error('Connection test failed:', error.message);
            return false;
        }
    }

    /**
     * Get unique values for filters
     */
    async getFilters() {
        if (!this.initialized) await this.initialize();

        const query = `
            SELECT 
                ARRAY_AGG(DISTINCT uf IGNORE NULLS ORDER BY uf) as uf,
                ARRAY_AGG(DISTINCT praca IGNORE NULLS ORDER BY praca) as praca,
                ARRAY_AGG(DISTINCT taxonomia IGNORE NULLS ORDER BY taxonomia) as taxonomia,
                ARRAY_AGG(DISTINCT exibidores IGNORE NULLS ORDER BY exibidores) as exibidores,
                ARRAY_AGG(DISTINCT formato IGNORE NULLS ORDER BY formato) as formato,
                ARRAY_AGG(DISTINCT regional_boticario IGNORE NULLS ORDER BY regional_boticario) as regional_boticario,
                ARRAY_AGG(DISTINCT cluster_exibidores IGNORE NULLS ORDER BY cluster_exibidores) as cluster_exibidores,
                ARRAY_AGG(DISTINCT cluster_formato IGNORE NULLS ORDER BY cluster_formato) as cluster_formato,
                ARRAY_AGG(DISTINCT periodicidade IGNORE NULLS ORDER BY periodicidade) as periodicidade,
                ARRAY_AGG(DISTINCT flight IGNORE NULLS ORDER BY flight) as flight
            FROM \`${config.projectId}.${config.dataset}.${MEDIA_TABLE}\`
        `;

        const [rows] = await this.bigquery.query({ query });
        const result = rows[0];

        return {
            uf: result.uf || [],
            praca: result.praca || [],
            taxonomia: result.taxonomia || [],
            exibidores: result.exibidores || [],
            formato: result.formato || [],
            regional_boticario: result.regional_boticario || [],
            cluster_exibidores: result.cluster_exibidores || [],
            cluster_formato: result.cluster_formato || [],
            periodicidade: result.periodicidade || [],
            flight: result.flight || [],
            digital: ['Tudo', 'Sim', 'Não'],
            estatico: ['Tudo', 'Sim', 'Não']
        };
    }

    /**
     * Get available options based on current selection
     */
    async getAvailableFilters(filters) {
        if (!this.initialized) await this.initialize();

        const fields = ['uf', 'praca', 'taxonomia', 'exibidores', 'formato', 'regional_boticario', 'cluster_exibidores', 'cluster_formato', 'periodicidade', 'flight'];
        const availableOptions = {};

        // We run parallel queries for better performance
        const promises = fields.map(async (field) => {
            let query = `SELECT DISTINCT ${field} FROM \`${config.projectId}.${config.dataset}.${MEDIA_TABLE}\` WHERE ${field} IS NOT NULL`;
            const params = {};

            fields.forEach(otherField => {
                if (field !== otherField && filters[otherField] && filters[otherField] !== 'Tudo') {
                    query += ` AND ${otherField} = @${otherField}`;
                    params[otherField] = filters[otherField];
                }
            });

            if (filters.digital && filters.digital !== 'Tudo') {
                query += ' AND digital = @digital_val';
                params.digital_val = filters.digital === 'Sim' ? 1 : 0;
            }

            if (filters.estatico && filters.estatico !== 'Tudo') {
                query += ' AND estatico = @estatico_val';
                params.estatico_val = filters.estatico === 'Sim' ? 1 : 0;
            }

            query += ` ORDER BY ${field}`;

            const [rows] = await this.bigquery.query({ query, params });
            return { field, options: rows.map(r => r[field]) };
        });

        const results = await Promise.all(promises);
        results.forEach(r => availableOptions[r.field] = r.options);

        return availableOptions;
    }

    /**
     * Calculate totals based on filters
     */
    async calculate(filters, quantity, discount) {
        if (!this.initialized) await this.initialize();

        let query = `SELECT * FROM \`${config.projectId}.${config.dataset}.${MEDIA_TABLE}\` WHERE 1=1`;
        const params = {};

        if (filters.uf && filters.uf !== 'Tudo') {
            query += ' AND uf = @uf';
            params.uf = filters.uf;
        }

        if (filters.praca && filters.praca !== 'Tudo') {
            query += ' AND praca = @praca';
            params.praca = filters.praca;
        }

        if (filters.taxonomia && filters.taxonomia !== 'Tudo') {
            query += ' AND taxonomia = @taxonomia';
            params.taxonomia = filters.taxonomia;
        }

        if (filters.exibidores && filters.exibidores !== 'Tudo') {
            query += ' AND exibidores = @exibidores';
            params.exibidores = filters.exibidores;
        }

        if (filters.formato && filters.formato !== 'Tudo') {
            query += ' AND formato = @formato';
            params.formato = filters.formato;
        }

        if (filters.regional_boticario && filters.regional_boticario !== 'Tudo') {
            query += ' AND regional_boticario = @regional_boticario';
            params.regional_boticario = filters.regional_boticario;
        }

        if (filters.cluster_exibidores && filters.cluster_exibidores !== 'Tudo') {
            query += ' AND cluster_exibidores = @cluster_exibidores';
            params.cluster_exibidores = filters.cluster_exibidores;
        }

        if (filters.cluster_formato && filters.cluster_formato !== 'Tudo') {
            query += ' AND cluster_formato = @cluster_formato';
            params.cluster_formato = filters.cluster_formato;
        }

        if (filters.periodicidade && filters.periodicidade !== 'Tudo') {
            query += ' AND periodicidade = @periodicidade';
            params.periodicidade = filters.periodicidade;
        }

        if (filters.flight && filters.flight !== 'Tudo') {
            query += ' AND flight = @flight';
            params.flight = filters.flight;
        }

        if (filters.digital && filters.digital !== 'Tudo') {
            query += ' AND digital = @digital';
            params.digital = filters.digital === 'Sim' ? 1 : 0;
        }

        if (filters.estatico && filters.estatico !== 'Tudo') {
            query += ' AND estatico = @estatico';
            params.estatico = filters.estatico === 'Sim' ? 1 : 0;
        }

        query += ' LIMIT 1'; // We only need one example row for pricing logic, as per original logic

        const [results] = await this.bigquery.query({ query, params });

        if (results.length === 0) {
            return {
                status: 'error',
                message: 'Nenhum dado encontrado para os filtros selecionados',
                total_liquido: null
            };
        }

        // Logic copied from server.js and adapted
        const item = results[0];
        const preco_unit = item.unitario_bruto_tabela || 0;
        const total_bruto = quantity * preco_unit;
        const total_liquido = total_bruto * (1 - discount);

        const minimo = item.range_minimo;
        const maximo = item.range_maximo;

        let warning = null;
        if (minimo && quantity < minimo) {
            warning = `Quantidade abaixo do mínimo recomendado (${minimo})`;
        } else if (maximo && quantity > maximo) {
            warning = `Quantidade acima do máximo recomendado (${maximo})`;
        }

        // Exposure logic (copied from server.js)
        const getExposureFactor = (formato, digital, estatico) => {
            const formatoLower = (formato || '').toLowerCase();
            if (formatoLower.includes('empena') || formatoLower.includes('painel')) return 50000;
            if (formatoLower.includes('metro') || formatoLower.includes('metrô')) return 45000;
            if (formatoLower.includes('aeroporto')) return 40000;
            if (formatoLower.includes('shopping')) return 35000;
            if (formatoLower.includes('parque')) return 30000;
            if (formatoLower.includes('abrigo') || formatoLower.includes('onibus') || formatoLower.includes('ônibus')) return digital ? 25000 : 20000;
            if (formatoLower.includes('mub') || formatoLower.includes('banca')) return 22000;
            if (formatoLower.includes('totem')) return digital ? 28000 : 18000;
            if (formatoLower.includes('circuito')) return 20000;
            if (formatoLower.includes('backbus') || formatoLower.includes('back bus')) return 18000;
            if (formatoLower.includes('backseat') || formatoLower.includes('back seat')) return 8000;
            if (formatoLower.includes('envelopamento')) return 35000;
            if (formatoLower.includes('exterior')) return 25000;
            return digital ? 15000 : 12000;
        };

        const exposureFactor = getExposureFactor(item.formato, item.digital, item.estatico);
        const exposicao_estimada = quantity * exposureFactor;
        const impactRate = item.digital ? 0.25 : 0.15;
        const impacto_estimado = exposicao_estimada * impactRate;

        let eficiencia = null;
        if (total_liquido > 0) {
            eficiencia = exposicao_estimada / total_liquido;
        }

        return {
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
            records_found: results.length, // Note: This is just 1 because of LIMIT, actual count would require separate query if needed, but original logic just checked if results > 0
            is_estimated: true,
            exposure_factor: exposureFactor
        };
    }

    /**
     * Get inventory list
     */
    async getInventory(filters) {
        if (!this.initialized) await this.initialize();

        let query = `SELECT * FROM \`${config.projectId}.${config.dataset}.${MEDIA_TABLE}\` WHERE 1=1`;
        const params = {};

        if (filters.uf && filters.uf !== 'Tudo') {
            query += ' AND uf = @uf';
            params.uf = filters.uf;
        }
        if (filters.praca && filters.praca !== 'Tudo') {
            query += ' AND praca = @praca';
            params.praca = filters.praca;
        }
        if (filters.taxonomia && filters.taxonomia !== 'Tudo') {
            query += ' AND taxonomia = @taxonomia';
            params.taxonomia = filters.taxonomia;
        }
        if (filters.exibidores && filters.exibidores !== 'Tudo') {
            query += ' AND exibidores = @exibidores';
            params.exibidores = filters.exibidores;
        }
        if (filters.formato && filters.formato !== 'Tudo') {
            query += ' AND formato = @formato';
            params.formato = filters.formato;
        }

        if (filters.regional_boticario && filters.regional_boticario !== 'Tudo') {
            query += ' AND regional_boticario = @regional_boticario';
            params.regional_boticario = filters.regional_boticario;
        }

        if (filters.cluster_exibidores && filters.cluster_exibidores !== 'Tudo') {
            query += ' AND cluster_exibidores = @cluster_exibidores';
            params.cluster_exibidores = filters.cluster_exibidores;
        }

        if (filters.cluster_formato && filters.cluster_formato !== 'Tudo') {
            query += ' AND cluster_formato = @cluster_formato';
            params.cluster_formato = filters.cluster_formato;
        }

        if (filters.periodicidade && filters.periodicidade !== 'Tudo') {
            query += ' AND periodicidade = @periodicidade';
            params.periodicidade = filters.periodicidade;
        }

        if (filters.flight && filters.flight !== 'Tudo') {
            query += ' AND flight = @flight';
            params.flight = filters.flight;
        }
        if (filters.digital && filters.digital !== 'Tudo') {
            query += ' AND digital = @digital';
            params.digital = filters.digital === 'Sim' ? 1 : 0;
        }
        if (filters.estatico && filters.estatico !== 'Tudo') {
            query += ' AND estatico = @estatico';
            params.estatico = filters.estatico === 'Sim' ? 1 : 0;
        }

        query += ' LIMIT 100';

        const [rows] = await this.bigquery.query({ query, params });
        return rows;
    }

    /**
     * Get database stats
     */
    async getStats() {
        if (!this.initialized) await this.initialize();

        const query = `
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT uf) as total_ufs,
                COUNT(DISTINCT praca) as total_pracas,
                COUNT(DISTINCT formato) as total_formatos
            FROM \`${config.projectId}.${config.dataset}.${MEDIA_TABLE}\`
        `;

        const [rows] = await this.bigquery.query({ query });
        return rows[0];
    }
}

// Export singleton instance
module.exports = new BigQueryService();
