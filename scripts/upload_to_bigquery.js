require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { BigQuery } = require('@google-cloud/bigquery');

// Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'boticario-485202';
const DATASET_ID = 'Boticario';
const TABLE_ID = 'media_inventory'; // New table for catalog data
const CSV_PATH = path.join(__dirname, '../Datasets/Dados_Consolidados_base_adicional - base.csv');
const KEY_FILENAME = path.join(__dirname, '../config/bigquery-key.json');

// Schema definition matching the CSV/SQLite structure
const SCHEMA = [
    { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
    { name: 'taxonomia', type: 'STRING', mode: 'NULLABLE' },
    { name: 'regional_boticario', type: 'STRING', mode: 'NULLABLE' },
    { name: 'uf', type: 'STRING', mode: 'NULLABLE' },
    { name: 'praca', type: 'STRING', mode: 'NULLABLE' },
    { name: 'cluster_exibidores', type: 'STRING', mode: 'NULLABLE' },
    { name: 'exibidores', type: 'STRING', mode: 'NULLABLE' },
    { name: 'cluster_formato', type: 'STRING', mode: 'NULLABLE' },
    { name: 'formato', type: 'STRING', mode: 'NULLABLE' },
    { name: 'estatico', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'digital', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'range_minimo', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'range_maximo', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'quantidade', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'periodicidade', type: 'STRING', mode: 'NULLABLE' },
    { name: 's1', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 's2', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 's3', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 's4', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'flight', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'unitario_bruto_tabela', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'desconto', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'unitario_bruto_negociado', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'total_bruto_negociado', type: 'FLOAT', mode: 'NULLABLE' }
];

// Helper to parse numbers
function parseDecimal(value) {
    if (!value || value === '') return null;
    if (typeof value === 'number') return value;
    return parseFloat(value.toString().replace(',', '.'));
}

function parseInt10(value) {
    if (!value || value === '') return null;
    if (typeof value === 'number') return value;
    return parseInt(value, 10);
}

async function uploadToBigQuery() {
    console.log('🚀 Starting upload to BigQuery...');

    // Initialize BigQuery client
    const options = { projectId: PROJECT_ID };
    if (fs.existsSync(KEY_FILENAME)) {
        console.log('🔑 Using Service Account key file');
        options.keyFilename = KEY_FILENAME;
    } else {
        console.log('⚠️  No key file found at ' + KEY_FILENAME);
        console.log('   Using Application Default Credentials or potentially failing if not authenticated.');
    }

    const bigquery = new BigQuery(options);
    const dataset = bigquery.dataset(DATASET_ID);
    const table = dataset.table(TABLE_ID);

    try {
        // Check if dataset exists
        const [datasetExists] = await dataset.exists();
        if (!datasetExists) {
            console.log(`Creating dataset ${DATASET_ID}...`);
            await dataset.create();
        }

        // Check if table exists
        const [tableExists] = await table.exists();
        if (!tableExists) {
            console.log(`📋 Creating table ${TABLE_ID}...`);
            await dataset.createTable(TABLE_ID, { schema: SCHEMA });
            console.log('✅ Table created.');
        } else {
            console.log(`ℹ️  Table ${TABLE_ID} already exists.`);
        }

        // Create a temporary JSONL file
        const TEMP_JSONL = path.join(__dirname, 'temp_inventory.jsonl');
        const jsonlStream = fs.createWriteStream(TEMP_JSONL);

        console.log('📂 Reading CSV and converting to JSONL...');
        let rowCount = 0;

        await new Promise((resolve, reject) => {
            fs.createReadStream(CSV_PATH)
                .pipe(csv())
                .on('data', (row) => {
                    const cleanRow = {
                        id: parseInt10(row.ID),
                        taxonomia: row.taxonomia,
                        regional_boticario: row.regional_boticario,
                        uf: row.uf,
                        praca: row.praca,
                        cluster_exibidores: row['Clustes exibidores'] || row.cluster_exibidores,
                        exibidores: row.exibidores,
                        cluster_formato: row['Cluster formato'] || row.cluster_formato,
                        formato: row.formato,
                        estatico: parseInt10(row.estatico) || 0,
                        digital: parseInt10(row.digital) || 0,
                        range_minimo: parseInt10(row.range_minimo),
                        range_maximo: parseInt10(row.range_maximo),
                        quantidade: parseInt10(row.quantidade),
                        periodicidade: row.periodicidade,
                        s1: parseInt10(row.s1) || 0,
                        s2: parseInt10(row.s2) || 0,
                        s3: parseInt10(row.s3) || 0,
                        s4: parseInt10(row.s4) || 0,
                        flight: parseInt10(row.flight) || 1,
                        unitario_bruto_tabela: parseDecimal(row.unitario_bruto_tabela),
                        desconto: parseDecimal(row.desconto),
                        unitario_bruto_negociado: parseDecimal(row.unitario_bruto_negociado),
                        total_bruto_negociado: parseDecimal(row.total_bruto_negociado)
                    };
                    jsonlStream.write(JSON.stringify(cleanRow) + '\n');
                    rowCount++;
                })
                .on('end', () => {
                    jsonlStream.end();
                    resolve();
                })
                .on('error', reject);
        });

        console.log(`📊 Parsed and written ${rowCount} rows to temp file.`);
        console.log('💾 Starting batch load job...');

        // Load data using a Load Job (Free tier friendly)
        const [job] = await table.load(TEMP_JSONL, {
            sourceFormat: 'NEWLINE_DELIMITED_JSON',
            writeDisposition: 'WRITE_TRUNCATE', // Overwrite table content
            autodetect: false
        });

        console.log(`⏳ Job ${job.id} started. Waiting for completion...`);

        // Poll for job completion
        let jobComplete = false;
        let errors = null;

        while (!jobComplete) {
            const [metadata] = await job.getMetadata();

            if (metadata.status.state === 'DONE') {
                jobComplete = true;
                if (metadata.status.errorResult) {
                    errors = metadata.status.errorResult;
                }
            } else {
                // Wait 1 second before checking again
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (errors) {
            console.error('❌ Job failed with errors:', errors);
        } else {
            console.log('🎉 Job completed successfully.');
        }

        // Cleanup
        if (fs.existsSync(TEMP_JSONL)) {
            fs.unlinkSync(TEMP_JSONL);
        }

        // Validation count
        const [rows_count] = await bigquery.query({
            query: `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\``
        });
        console.log(`✅ Validated: Table contains ${rows_count[0].count} rows.`);

    } catch (err) {
        console.error('❌ Error during upload:', err);
    }
}

uploadToBigQuery();
