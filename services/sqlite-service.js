/**
 * SQLite Service (Fallback for local testing when BigQuery is unavailable)
 * This reads from the local ooh_planner.db SQLite database
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/ooh_planner.db');

class SQLiteService {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            this.db = new Database(DB_PATH, { readonly: true });
            this.initialized = true;
            console.log('✅ SQLite service initialized (fallback mode)');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize SQLite:', error.message);
            throw error;
        }
    }

    async getFilters() {
        if (!this.initialized) await this.initialize();

        const query = `
            SELECT DISTINCT uf FROM inventory WHERE uf IS NOT NULL ORDER BY uf
        `;
        const ufs = this.db.prepare(query).all().map(r => r.uf);

        const pracas = this.db.prepare('SELECT DISTINCT praca FROM inventory WHERE praca IS NOT NULL ORDER BY praca').all().map(r => r.praca);
        const taxonomias = this.db.prepare('SELECT DISTINCT taxonomia FROM inventory WHERE taxonomia IS NOT NULL ORDER BY taxonomia').all().map(r => r.taxonomia);
        const exibidores = this.db.prepare('SELECT DISTINCT exibidores FROM inventory WHERE exibidores IS NOT NULL ORDER BY exibidores').all().map(r => r.exibidores);
        const formatos = this.db.prepare('SELECT DISTINCT formato FROM inventory WHERE formato IS NOT NULL ORDER BY formato').all().map(r => r.formato);

        return {
            uf: ufs,
            praca: pracas,
            taxonomia: taxonomias,
            exibidores: exibidores,
            formato: formatos,
            regional_boticario: this.db.prepare('SELECT DISTINCT regional_boticario FROM inventory WHERE regional_boticario IS NOT NULL ORDER BY regional_boticario').all().map(r => r.regional_boticario),
            cluster_exibidores: this.db.prepare('SELECT DISTINCT cluster_exibidores FROM inventory WHERE cluster_exibidores IS NOT NULL ORDER BY cluster_exibidores').all().map(r => r.cluster_exibidores),
            cluster_formato: this.db.prepare('SELECT DISTINCT cluster_formato FROM inventory WHERE cluster_formato IS NOT NULL ORDER BY cluster_formato').all().map(r => r.cluster_formato),
            periodicidade: this.db.prepare('SELECT DISTINCT periodicidade FROM inventory WHERE periodicidade IS NOT NULL ORDER BY periodicidade').all().map(r => r.periodicidade),
            flight: this.db.prepare('SELECT DISTINCT flight FROM inventory WHERE flight IS NOT NULL ORDER BY flight').all().map(r => r.flight),
            digital: ['Tudo', 'Sim', 'Não'],
            estatico: ['Tudo', 'Sim', 'Não']
        };
    }

    async getAvailableFilters(filters) {
        if (!this.initialized) await this.initialize();

        const fields = ['uf', 'praca', 'taxonomia', 'exibidores', 'formato', 'regional_boticario', 'cluster_exibidores', 'cluster_formato', 'periodicidade', 'flight'];
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

            if (filters.digital === true) {
                query += ' AND digital = ?';
                params.push(1);
            }

            if (filters.estatico === true) {
                query += ' AND estatico = ?';
                params.push(1);
            }

            query += ` ORDER BY ${field}`;

            const results = this.db.prepare(query).all(...params);
            availableOptions[field] = results.map(r => r[field]);
        });

        return availableOptions;
    }

    async getInventory(filters) {
        if (!this.initialized) await this.initialize();

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
        if (filters.regional_boticario && filters.regional_boticario !== 'Tudo') {
            query += ' AND regional_boticario = ?';
            params.push(filters.regional_boticario);
        }
        if (filters.cluster_exibidores && filters.cluster_exibidores !== 'Tudo') {
            query += ' AND cluster_exibidores = ?';
            params.push(filters.cluster_exibidores);
        }
        if (filters.cluster_formato && filters.cluster_formato !== 'Tudo') {
            query += ' AND cluster_formato = ?';
            params.push(filters.cluster_formato);
        }
        if (filters.periodicidade && filters.periodicidade !== 'Tudo') {
            query += ' AND periodicidade = ?';
            params.push(filters.periodicidade);
        }
        if (filters.flight && filters.flight !== 'Tudo') {
            query += ' AND flight = ?';
            params.push(filters.flight);
        }
        if (filters.digital === true) {
            query += ' AND digital = ?';
            params.push(1);
        }
        if (filters.estatico === true) {
            query += ' AND estatico = ?';
            params.push(1);
        }

        const rows = this.db.prepare(query).all(...params);
        return rows;
    }

    async getStats() {
        if (!this.initialized) await this.initialize();

        const query = `
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT uf) as total_ufs,
                COUNT(DISTINCT praca) as total_pracas
            FROM inventory
        `;

        return this.db.prepare(query).get();
    }

    async calculate(filters, quantity, discount) {
        if (!this.initialized) await this.initialize();

        const inventory = await this.getInventory(filters);

        if (inventory.length === 0) {
            return {
                status: 'error',
                message: 'Nenhum dado encontrado para os filtros selecionados',
                total_liquido: null
            };
        }

        const item = inventory[0];
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

        // Exposure logic matching BigQuery service
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
            preco_unit,
            records_found: inventory.length,
            exposicao_estimada,
            eficiencia,
            impacto_estimado,
            exposure_factor: exposureFactor
        };
    }

    async testConnection() {
        try {
            await this.initialize();
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = new SQLiteService();
