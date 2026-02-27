/**
 * Import Excel PLAN sheets into SQLite
 * 
 * Reads all *PLAN tabs from the client's Excel file,
 * normalizes columns, resolves ranking→pesos via lookup table,
 * and inserts into the inventory table.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'ooh_planner.db');
const EXCEL_PATH = path.join(__dirname, '../Datasets/Planilhas OOH PLANNER_enviadas_ Pesos.xlsx');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Standard column order in PLAN sheets (by position index)
const COL_MAP = [
    'taxonomia',              // 0 - sometimes called 'ciclos'
    'regional_boticario',     // 1
    'uf',                     // 2
    'praca',                  // 3
    'exibidores',             // 4
    'formato',                // 5
    'ranking',                // 6 - sometimes called 'ranking formato'
    'pesos',                  // 7
    'estatico',               // 8 - "X" or null
    'digital',                // 9 - "X" or null
    'range_minimo',           // 10
    'range_maximo',           // 11
    'quantidade',             // 12
    'periodicidade',          // 13
    's1',                     // 14
    's2',                     // 15
    's3',                     // 16
    's4',                     // 17
    'flight',                 // 18
    'unitario_bruto_tabela',  // 19
    'desconto',               // 20
    'unitario_bruto_negociado', // 21
    'total_bruto_negociado'   // 22
];

function importExcel() {
    console.log('🚀 Iniciando importação do Excel...\n');

    if (!fs.existsSync(EXCEL_PATH)) {
        console.error('❌ Arquivo Excel não encontrado:', EXCEL_PATH);
        process.exit(1);
    }

    // 1. Read Excel
    console.log('📂 Lendo arquivo Excel...');
    const wb = XLSX.readFile(EXCEL_PATH);
    console.log(`   ${wb.SheetNames.length} abas encontradas\n`);

    // 2. Extract Pesos lookup table
    console.log('📊 Extraindo tabela de Pesos...');
    const pesosLookup = {};
    const pesosSheet = wb.Sheets['Pesos'];
    if (pesosSheet) {
        const pesosData = XLSX.utils.sheet_to_json(pesosSheet, { header: 1 });
        pesosData.forEach(row => {
            if (row.length >= 2 && typeof row[0] === 'number' && typeof row[1] === 'number') {
                pesosLookup[row[0]] = row[1];
            }
        });
        console.log(`   ${Object.keys(pesosLookup).length} mapeamentos: ${JSON.stringify(pesosLookup)}\n`);
    } else {
        console.warn('⚠️  Aba "Pesos" não encontrada, usando lookup padrão');
        // Fallback lookup
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((r, i) => {
            pesosLookup[r] = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0.03, 0.02][i];
        });
    }

    // 3. Create/recreate database
    if (fs.existsSync(DB_PATH)) {
        console.log('🗑️  Removendo banco de dados existente...');
        fs.unlinkSync(DB_PATH);
    }

    const db = new Database(DB_PATH);
    console.log('✅ Banco de dados criado\n');

    // Execute schema
    console.log('📋 Criando tabelas...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    console.log('✅ Tabelas criadas\n');

    // 4. Prepare insert statement
    const insert = db.prepare(`
        INSERT INTO inventory (
            taxonomia, regional_boticario, uf, praca,
            exibidores, formato,
            ranking, pesos,
            estatico, digital,
            range_minimo, range_maximo, quantidade,
            periodicidade, s1, s2, s3, s4, flight,
            unitario_bruto_tabela, desconto,
            unitario_bruto_negociado, total_bruto_negociado
        ) VALUES (
            ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?
        )
    `);

    // 5. Process each PLAN sheet
    const planSheets = wb.SheetNames.filter(n => n.toUpperCase().includes('PLAN'));
    console.log(`📊 Processando ${planSheets.length} abas PLAN...\n`);

    let totalImported = 0;
    let totalErrors = 0;

    const insertMany = db.transaction((allRows) => {
        for (const { sheetName, row, rowIndex } of allRows) {
            try {
                // Parse values
                const taxonomia = String(row[0] || '').trim().toLowerCase();
                const regional = String(row[1] || '').trim().toLowerCase();
                const uf = String(row[2] || '').trim().toLowerCase();
                const praca = String(row[3] || '').trim().toLowerCase();
                const exibidores = String(row[4] || '').trim();
                const formato = String(row[5] || '').trim();

                // Skip empty/header rows
                if (!praca || praca === 'praca' || !formato) continue;

                // Ranking: must be integer 1-12
                let ranking = null;
                const rawRanking = row[6];
                if (typeof rawRanking === 'number' && Number.isInteger(rawRanking) && rawRanking >= 1 && rawRanking <= 12) {
                    ranking = rawRanking;
                }

                // Pesos: resolve via lookup if ranking is valid, otherwise use raw value
                let pesos = null;
                if (ranking !== null && pesosLookup[ranking] !== undefined) {
                    pesos = pesosLookup[ranking];
                } else {
                    const rawPesos = row[7];
                    if (typeof rawPesos === 'number' && rawPesos > 0 && rawPesos <= 1) {
                        pesos = rawPesos;
                    }
                }

                // Estatico/Digital: "X" → 1, anything else → 0
                const estatico = (String(row[8] || '').trim().toUpperCase() === 'X') ? 1 : 0;
                const digital = (String(row[9] || '').trim().toUpperCase() === 'X') ? 1 : 0;

                // Numeric fields
                const parseNum = (v) => {
                    if (v === null || v === undefined || v === '') return null;
                    if (typeof v === 'number') return v;
                    const n = parseFloat(String(v).replace(',', '.'));
                    return isNaN(n) ? null : n;
                };

                const parseIntSafe = (v) => {
                    if (v === null || v === undefined || v === '') return null;
                    if (typeof v === 'number') return Math.round(v);
                    const n = parseInt(String(v), 10);
                    return isNaN(n) ? null : n;
                };

                const range_minimo = parseIntSafe(row[10]);
                const range_maximo = parseIntSafe(row[11]);
                const quantidade = parseIntSafe(row[12]);
                const periodicidade = row[13] ? String(row[13]).trim() : null;
                const s1 = parseIntSafe(row[14]) || 0;
                const s2 = parseIntSafe(row[15]) || 0;
                const s3 = parseIntSafe(row[16]) || 0;
                const s4 = parseIntSafe(row[17]) || 0;
                const flight = parseIntSafe(row[18]) || 1;
                const unitario_bruto_tabela = parseNum(row[19]);
                const desconto = parseNum(row[20]);
                const unitario_bruto_negociado = parseNum(row[21]);
                const total_bruto_negociado = parseNum(row[22]);

                // Skip rows without price data
                if (unitario_bruto_tabela === null) continue;

                insert.run(
                    taxonomia, regional, uf, praca,
                    exibidores, formato,
                    ranking, pesos,
                    estatico, digital,
                    range_minimo, range_maximo, quantidade,
                    periodicidade, s1, s2, s3, s4, flight,
                    unitario_bruto_tabela, desconto,
                    unitario_bruto_negociado, total_bruto_negociado
                );

                totalImported++;
            } catch (err) {
                totalErrors++;
                if (totalErrors <= 5) {
                    console.error(`   ❌ Erro em ${sheetName} linha ${rowIndex}:`, err.message);
                }
            }
        }
    });

    // Collect all rows first
    const allRows = [];
    for (const sheetName of planSheets) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
        // Skip header row (index 0)
        for (let i = 1; i < data.length; i++) {
            allRows.push({ sheetName, row: data[i], rowIndex: i });
        }
        console.log(`   📄 ${sheetName}: ${data.length - 1} linhas`);
    }

    // Insert in a single transaction
    console.log('\n💾 Inserindo dados...');
    insertMany(allRows);

    console.log(`\n✅ Importação concluída!`);
    console.log(`   📥 ${totalImported} registros importados`);
    if (totalErrors > 0) {
        console.log(`   ⚠️  ${totalErrors} erros encontrados`);
    }

    // 6. Print statistics
    const stats = db.prepare('SELECT COUNT(*) as total FROM inventory').get();
    const ufs = db.prepare('SELECT COUNT(DISTINCT uf) as total FROM inventory').get();
    const pracas = db.prepare('SELECT COUNT(DISTINCT praca) as total FROM inventory').get();
    const comRanking = db.prepare('SELECT COUNT(*) as total FROM inventory WHERE ranking IS NOT NULL').get();
    const comPesos = db.prepare('SELECT COUNT(*) as total FROM inventory WHERE pesos IS NOT NULL').get();

    console.log(`\n📊 Estatísticas:`);
    console.log(`   Total de registros: ${stats.total}`);
    console.log(`   UFs únicas: ${ufs.total}`);
    console.log(`   Praças únicas: ${pracas.total}`);
    console.log(`   Com ranking: ${comRanking.total}`);
    console.log(`   Com pesos: ${comPesos.total}`);

    // Distribution of rankings
    const dist = db.prepare('SELECT ranking, pesos, COUNT(*) as count FROM inventory WHERE ranking IS NOT NULL GROUP BY ranking, pesos ORDER BY ranking').all();
    console.log(`\n📊 Distribuição de Rankings:`);
    dist.forEach(r => console.log(`   Ranking ${r.ranking} (peso ${r.pesos}): ${r.count} registros`));

    db.close();
    console.log('\n🎉 Importação finalizada com sucesso!\n');
}

// Run
importExcel();
