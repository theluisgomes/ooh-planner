/**
 * BigQuery Configuration
 * Loads BigQuery settings from environment variables
 * Supports both Service Account keys and Application Default Credentials
 */

require('dotenv').config();

const config = {
    projectId: process.env.BIGQUERY_PROJECT_ID || 'boticario-485202',
    dataset: process.env.BIGQUERY_DATASET || 'Boticario',
    table: process.env.BIGQUERY_TABLE || 'planning_sessions',
    // keyFilename is optional - if not provided, will use Application Default Credentials
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || null
};

// Validate configuration
function validateConfig() {
    const required = ['projectId', 'dataset', 'table'];
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing BigQuery configuration: ${missing.join(', ')}`);
    }

    return true;
}

module.exports = {
    config,
    validateConfig
};
