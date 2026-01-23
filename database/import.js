const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'ooh_planner.db');
const CSV_PATH = path.join(__dirname, '../Datasets/Dados_Consolidados_base_adicional - base.csv');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Função para converter string com vírgula para número
function parseDecimal(value) {
    if (!value || value === '') return null;
    return parseFloat(value.toString().replace(',', '.'));
}

function parseInt10(value) {
    if (!value || value === '') return null;
    return parseInt(value, 10);
}

async function importData() {
    console.log('🚀 Iniciando importação de dados...\n');

    // Criar/recriar banco de dados
    if (fs.existsSync(DB_PATH)) {
        console.log('🗑️  Removendo banco de dados existente...');
        fs.unlinkSync(DB_PATH);
    }

    const db = new Database(DB_PATH);
    console.log('✅ Banco de dados criado\n');

    // Executar schema
    console.log('📋 Criando tabelas...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    console.log('✅ Tabelas criadas\n');

    // Preparar statement de inserção
    const insert = db.prepare(`
        INSERT INTO inventory (
            id, taxonomia, regional_boticario, uf, praca,
            cluster_exibidores, exibidores, cluster_formato, formato,
            estatico, digital, range_minimo, range_maximo,
            quantidade, periodicidade, s1, s2, s3, s4, flight,
            unitario_bruto_tabela, desconto, unitario_bruto_negociado,
            total_bruto_negociado
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?
        )
    `);

    // Ler e importar CSV
    console.log('📂 Lendo arquivo CSV...');
    const rows = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                rows.push(row);
            })
            .on('end', () => {
                console.log(`📊 ${rows.length} linhas encontradas\n`);
                console.log('💾 Importando dados...');

                const insertMany = db.transaction((rows) => {
                    let imported = 0;
                    let errors = 0;

                    for (const row of rows) {
                        try {
                            insert.run(
                                parseInt10(row.ID),
                                row.taxonomia,
                                row.regional_boticario,
                                row.uf,
                                row.praca,
                                row['Clustes exibidores'] || row.cluster_exibidores,
                                row.exibidores,
                                row['Cluster formato'] || row.cluster_formato,
                                row.formato,
                                parseInt10(row.estatico) || 0,
                                parseInt10(row.digital) || 0,
                                parseInt10(row.range_minimo),
                                parseInt10(row.range_maximo),
                                parseInt10(row.quantidade),
                                row.periodicidade,
                                parseInt10(row.s1) || 0,
                                parseInt10(row.s2) || 0,
                                parseInt10(row.s3) || 0,
                                parseInt10(row.s4) || 0,
                                parseInt10(row.flight) || 1,
                                parseDecimal(row.unitario_bruto_tabela),
                                parseDecimal(row.desconto),
                                parseDecimal(row.unitario_bruto_negociado),
                                parseDecimal(row.total_bruto_negociado)
                            );
                            imported++;
                        } catch (err) {
                            errors++;
                            if (errors <= 5) {
                                console.error(`❌ Erro na linha ${row.ID}:`, err.message);
                            }
                        }
                    }

                    return { imported, errors };
                });

                const result = insertMany(rows);
                
                console.log(`\n✅ Importação concluída!`);
                console.log(`   📥 ${result.imported} registros importados`);
                if (result.errors > 0) {
                    console.log(`   ⚠️  ${result.errors} erros encontrados`);
                }

                // Estatísticas
                const stats = db.prepare('SELECT COUNT(*) as total FROM inventory').get();
                const ufs = db.prepare('SELECT COUNT(DISTINCT uf) as total FROM inventory').get();
                const pracas = db.prepare('SELECT COUNT(DISTINCT praca) as total FROM inventory').get();
                
                console.log(`\n📊 Estatísticas:`);
                console.log(`   Total de registros: ${stats.total}`);
                console.log(`   UFs únicas: ${ufs.total}`);
                console.log(`   Praças únicas: ${pracas.total}`);

                db.close();
                console.log('\n🎉 Importação finalizada com sucesso!\n');
                resolve();
            })
            .on('error', reject);
    });
}

// Executar importação
importData().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
