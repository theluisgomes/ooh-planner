/**
 * BigQuery Service
 * Handles all BigQuery operations for storing OOH planning data
 */

const { BigQuery } = require('@google-cloud/bigquery');
const { config, validateConfig } = require('../config/bigquery-config');
const fs = require('fs');

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
            const { activeBlocks, totalBudget } = planningData;

            if (!activeBlocks || activeBlocks.length === 0) {
                throw new Error('No active blocks to store');
            }

            // Generate unique session ID
            const sessionId = this.generateSessionId();
            const timestamp = new Date().toISOString();

            // Transform data to match BigQuery schema (flat structure)
            const rows = activeBlocks.map(block => ({
                session_id: sessionId,
                timestamp: timestamp,
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
            console.log(`   Total Budget: R$ ${totalBudget.toFixed(2)}`);

            return {
                success: true,
                sessionId,
                rowsInserted: rows.length,
                timestamp
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
}

// Export singleton instance
module.exports = new BigQueryService();
