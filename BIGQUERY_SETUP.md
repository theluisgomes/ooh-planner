# BigQuery Integration - Quick Start Guide

## ✅ What's Been Implemented

The OOH Planner now has full BigQuery integration! Here's what was added:

### Backend
- ✅ BigQuery Node.js client library installed
- ✅ Configuration module (`config/bigquery-config.js`)
- ✅ BigQuery service (`services/bigquery-service.js`)
- ✅ API endpoints:
  - `POST /api/bigquery/store` - Store planning data
  - `GET /api/bigquery/test` - Test connection
- ✅ Environment variables setup (`.env`)

### Frontend
- ✅ "STORE ON BIGQUERY" button now functional
- ✅ Loading states and user feedback
- ✅ Error handling with helpful messages

### Security
- ✅ `.gitignore` updated to exclude credentials
- ✅ Environment variables for sensitive data

---

## 🔑 Next Steps: Complete Setup

### 1. Create Service Account (If Not Done)

Follow the guide in `service_account_setup.md` to:
1. Create a service account in Google Cloud Console
2. Grant BigQuery permissions
3. Download the JSON key file

### 2. Place the Key File

Move your downloaded JSON key file to:
```
/Users/LuisGomes/Desktop/Casa Gomo/Wisemetrics/ALMAP:BOTI/Planner_ooh_V1/config/bigquery-key.json
```

**Command to create config folder (if needed):**
```bash
mkdir -p config
```

### 3. Verify Configuration

Your `.env` file is already configured with:
- Project ID: `boticario-485202`
- Dataset: `Boticario`
- Table: `inventory`

### 4. Test the Connection

Start the server and test:
```bash
npm start
```

Then visit: http://localhost:3000/api/bigquery/test

Or use curl:
```bash
curl http://localhost:3000/api/bigquery/test
```

### 5. Use the Application

1. Open http://localhost:3000
2. Configure your media blocks
3. Click "💾 STORE ON BIGQUERY"
4. Confirm the storage
5. Check your BigQuery console to see the data!

---

## 📊 BigQuery Schema

The table will be auto-created with this schema:

| Field | Type | Description |
|-------|------|-------------|
| session_id | STRING | Unique session identifier |
| timestamp | TIMESTAMP | When data was stored |
| block_id | INTEGER | Media block number (1-16) |
| uf | STRING | State filter |
| praca | STRING | Market filter |
| taxonomia | STRING | Taxonomy filter |
| exibidores | STRING | Exhibitor filter |
| formato | STRING | Format filter |
| digital | STRING | Digital filter |
| estatico | STRING | Static filter |
| quantidade | INTEGER | Quantity |
| desconto | FLOAT | Discount (0-1) |
| total_liquido | FLOAT | Net total |
| total_bruto | FLOAT | Gross total |
| preco_unitario | FLOAT | Unit price |
| minimo | INTEGER | Minimum recommended |
| maximo | INTEGER | Maximum recommended |
| warning | STRING | Guardrail warnings |
| exposicao_estimada | FLOAT | Estimated exposure |
| eficiencia | FLOAT | Efficiency metric |
| records_found | INTEGER | Records found in query |

---

## 🔍 Querying Your Data

Once data is stored, you can query it in BigQuery:

```sql
-- View all stored sessions
SELECT DISTINCT session_id, timestamp, COUNT(*) as blocks
FROM `boticario-485202.Boticario.inventory`
GROUP BY session_id, timestamp
ORDER BY timestamp DESC;

-- View latest planning session
SELECT *
FROM `boticario-485202.Boticario.inventory`
WHERE session_id = (
  SELECT session_id 
  FROM `boticario-485202.Boticario.inventory` 
  ORDER BY timestamp DESC 
  LIMIT 1
);

-- Calculate total budget by state
SELECT uf, SUM(total_liquido) as total_budget
FROM `boticario-485202.Boticario.inventory`
GROUP BY uf
ORDER BY total_budget DESC;
```

---

## ⚠️ Troubleshooting

### Error: "key file not found"
- Make sure `bigquery-key.json` is in the `config/` folder
- Check the path in `.env` file

### Error: "Permission denied"
- Verify service account has "BigQuery Data Editor" role
- Check service account has "BigQuery Job User" role

### Error: "Dataset not found"
- Verify dataset name is exactly `Boticario`
- Check project ID is `boticario-485202`

### Error: "Table not found"
- The table will be auto-created on first use
- If it fails, check service account permissions

---

## 📝 Files Created

- `config/bigquery-config.js` - Configuration loader
- `services/bigquery-service.js` - BigQuery operations
- `.env` - Environment variables
- `.env.example` - Template for environment variables
- Updated `server.js` - Added API endpoints
- Updated `public/js/app.js` - Frontend integration
- Updated `.gitignore` - Security

---

## 🎉 You're All Set!

Once you place the service account key file, you'll be able to store all your OOH planning data directly to BigQuery for analysis and reporting!
