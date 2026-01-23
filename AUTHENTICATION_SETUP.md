# BigQuery Authentication Setup

## ⚠️ Organization Policy Issue

Your organization has disabled Service Account key creation. This is a common security policy.

**Error:** `iam.disableServiceAccountKeyCreation`

---

## ✅ Solution: Use Application Default Credentials (ADC)

Application Default Credentials allow you to authenticate using your personal Google Cloud account instead of a service account.

### Step 1: Install Google Cloud SDK

**On macOS:**
```bash
brew install --cask google-cloud-sdk
```

**On Linux:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

**On Windows:**
Download from: https://cloud.google.com/sdk/docs/install

### Step 2: Initialize and Authenticate

```bash
# Initialize gcloud (if first time)
gcloud init

# Authenticate with Application Default Credentials
gcloud auth application-default login
```

This will open a browser window. Log in with your Google account that has access to the `boticario-485202` project.

### Step 3: Set Your Project

```bash
gcloud config set project boticario-485202
```

### Step 4: Verify Your Permissions

Make sure your account has the following roles in the project:
- **BigQuery Data Editor** - To insert data
- **BigQuery Job User** - To run queries

You can check your permissions in the Google Cloud Console:
https://console.cloud.google.com/iam-admin/iam?project=boticario-485202

### Step 5: Test the Connection

Start your server:
```bash
npm start
```

Test the BigQuery connection:
```bash
curl http://localhost:3000/api/bigquery/test
```

Or visit in your browser:
```
http://localhost:3000/api/bigquery/test
```

You should see:
```json
{
  "success": true,
  "message": "BigQuery connection successful"
}
```

---

## 🎯 How It Works

The application has been updated to support **both** authentication methods:

1. **Service Account Key** (if your org allows it)
   - Place key file at `config/bigquery-key.json`
   - Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`

2. **Application Default Credentials** (recommended for your case)
   - No key file needed
   - Uses your personal Google Cloud credentials
   - Automatically detected by the BigQuery client

The code will automatically detect which method to use:
- If a key file exists → uses Service Account
- If no key file → uses Application Default Credentials

---

## 🔍 Troubleshooting

### Error: "User does not have permission"

**Solution:** Ask your Google Cloud admin to grant you these roles:
- BigQuery Data Editor
- BigQuery Job User

### Error: "Could not load the default credentials"

**Solution:** Run the authentication command again:
```bash
gcloud auth application-default login
```

### Error: "Dataset not found"

**Solution:** Verify the dataset exists:
```bash
bq ls --project_id=boticario-485202
```

If the dataset doesn't exist, create it:
```bash
bq mk --dataset boticario-485202:Boticario
```

---

## 📝 Alternative: Ask Admin to Create Service Account

If you need to use a Service Account (for production deployment), ask your Google Cloud administrator to:

1. Create a Service Account for you
2. Grant it the required BigQuery roles
3. Either:
   - **Option A:** Disable the key creation policy temporarily
   - **Option B:** Create the key themselves and share it securely
   - **Option C:** Use Workload Identity (for Kubernetes/GKE deployments)

---

## ✅ You're Ready!

Once you've completed the steps above, your OOH Planner will be able to store data to BigQuery using your personal credentials. The "💾 STORE ON BIGQUERY" button will work perfectly!
