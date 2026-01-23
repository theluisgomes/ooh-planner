/**
 * Import CSV data to BigQuery
 * This script imports the inventory data from CSV to BigQuery table 'inventory'
 */

require('dotenv').config();
const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs');
const path = require('path');

const projectId = process.env.BIGQUERY_PROJECT_ID || 'boticario-485202';
const datasetId = process.env.BIGQUERY_DATASET || 'Boticario';
const tableId = 'inventory';  // Using the existing inventory table
const csvFilePath = path.join(__dirname, '../Datasets/Dados_Consolidados_base_adicional - base.csv');

async function importCSVToBigQuery() {
    console.log('🚀 Starting CSV import to BigQuery...\n');

    try {
        // Check if CSV file exists
        if (!fs.existsSync(csvFilePath)) {
            throw new Error(`CSV file not found: ${csvFilePath}`);
        }

        console.log(`📁 CSV File: ${csvFilePath}`);
        console.log(`📊 Project: ${projectId}`);
        console.log(`📦 Dataset: ${datasetId}`);
        console.log(`📋 Table: ${tableId}\n`);

        // Initialize BigQuery client
        const bigquery = new BigQuery({ projectId });

        // Define schema matching the CSV structure
        const schema = [
            { name: 'ID', type: 'INTEGER', mode: 'NULLABLE' },
            { name: 'taxonomia', type: 'STRING', mode: 'NULLABLE' },
            { name: 'regional_boticario', type: 'STRING', mode: 'NULLABLE' },
            { name: 'uf', type: 'STRING', mode: 'NULLABLE' },
            { name: 'praca', type: 'STRING', mode: 'NULLABLE' },
            { name: 'Clustes_exibidores', type: 'STRING', mode: 'NULLABLE' },
            { name: 'exibidores', type: 'STRING', mode: 'NULLABLE' },
            { name: 'Cluster_formato', type: 'STRING', mode: 'NULLABLE' },
            { name: 'formato', type: 'STRING', mode: 'NULLABLE' },
            { name: 'estatico', type: 'INTEGER', mode: 'NULLABLE' },
            { name: 'digital', type: 'INTEGER', mode: 'NULLABLE' },
            { name: 'range_minimo', type: 'STRING', mode: 'NULLABLE' },  // Changed to STRING
            { name: 'range_maximo', type: 'STRING', mode: 'NULLABLE' },  // Changed to STRING
            { name: 'quantidade', type: 'STRING', mode: 'NULLABLE' },    // Changed to STRING (has values like "5/15")
            { name: 'periodicidade', type: 'STRING', mode: 'NULLABLE' },
            { name: 's1', type: 'STRING', mode: 'NULLABLE' },            // Changed to STRING
            { name: 's2', type: 'STRING', mode: 'NULLABLE' },            // Changed to STRING
            { name: 's3', type: 'STRING', mode: 'NULLABLE' },            // Changed to STRING
            { name: 's4', type: 'STRING', mode: 'NULLABLE' },            // Changed to STRING
            { name: 'flight', type: 'INTEGER', mode: 'NULLABLE' },
            { name: 'unitario_bruto_tabela', type: 'STRING', mode: 'NULLABLE' },  // Changed to STRING (has commas)
            { name: 'desconto', type: 'STRING', mode: 'NULLABLE' },               // Changed to STRING (has commas)
            { name: 'unitario_bruto_negociado', type: 'STRING', mode: 'NULLABLE' }, // Changed to STRING (has commas)
            { name: 'total_bruto_negociado', type: 'STRING', mode: 'NULLABLE' }     // Changed to STRING (has commas)
        ];

        // Check if table exists
        const dataset = bigquery.dataset(datasetId);
        const table = dataset.table(tableId);
        const [tableExists] = await table.exists();

        if (tableExists) {
            console.log(`⚠️  Table '${tableId}' already exists. Deleting it first...`);
            await table.delete();
            console.log(`✅ Table deleted\n`);
        }

        // Create table
        console.log(`📋 Creating table '${tableId}'...`);
        await dataset.createTable(tableId, { schema });
        console.log(`✅ Table created\n`);

        // Load CSV data
        console.log(`📤 Uploading CSV data...`);
        const metadata = {
            sourceFormat: 'CSV',
            skipLeadingRows: 1,
            schema: { fields: schema },
            location: 'US',
            fieldDelimiter: ',',
            allowQuotedNewlines: true,
            allowJaggedRows: false,
            encoding: 'UTF-8'
        };

        const [job] = await table.load(csvFilePath, metadata);

        // Wait for the job to complete
        console.log(`⏳ Job ${job.id} started...`);

        // Poll for job completion
        await job.promise();

        // Get job metadata to check for errors
        const [jobMetadata] = await job.getMetadata();

        // Check for errors
        if (jobMetadata.status && jobMetadata.status.errors && jobMetadata.status.errors.length > 0) {
            console.error('❌ Errors during import:');
            jobMetadata.status.errors.forEach(error => {
                console.error(`  - ${error.message}`);
            });
            throw new Error('Import failed with errors');
        }

        console.log(`\n✅ Import completed successfully!`);

        // Get row count
        const query = `SELECT COUNT(*) as count FROM \`${projectId}.${datasetId}.${tableId}\``;
        const [countResult] = await bigquery.query({ query });
        const rowCount = countResult[0].count;

        console.log(`\n📊 Statistics:`);
        console.log(`   Total rows imported: ${rowCount}`);
        console.log(`\n🎉 Data is now available in BigQuery!`);
        console.log(`\n🔗 View in console:`);
        console.log(`   https://console.cloud.google.com/bigquery?project=${projectId}&ws=!1m5!1m4!4m3!1s${projectId}!2s${datasetId}!3s${tableId}`);

    } catch (error) {
        console.error('\n❌ Error importing CSV to BigQuery:');
        console.error(error.message);
        if (error.errors) {
            error.errors.forEach(err => {
                console.error(`  - ${err.message}`);
            });
        }
        process.exit(1);
    }
}

// Run the import
importCSVToBigQuery();
