# Capricorn Medical Research Application

A medical research application that uses AI to analyze pediatric oncology cases and provide treatment recommendations by searching through PubMed articles using vector embeddings and Gemini.

## Architecture Overview

![Architecture Diagram](visuals/capricorn_architecture.png)

The application consists of:
- **Frontend**: React application hosted on Firebase
- **Backend**: Cloud Functions for data processing pipeline
- **Database**: Firestore for chat storage, BigQuery for article embeddings
- **AI Services**: Gemini for analysis, DLP for PII redaction

## Prerequisites

- Google Cloud Platform account with billing enabled
- Node.js 18 or higher
- Firebase CLI installed (`npm install -g firebase-tools`)
- gcloud CLI installed and configured
- SendGrid account for email notifications

## Setup Instructions

### 1. Firestore Database Setup

Create a Firestore database for storing chat conversations.

**Prerequisites:**
- Install gcloud CLI: https://cloud.google.com/sdk/docs/install
- Authenticate: `gcloud auth login`
- Set project: `gcloud config set project YOUR_GCP_PROJECT_ID`

**1. Set project variables and enable APIs:**

First, link Firebase to your existing Google Cloud project:

**Link Firebase to Your Google Cloud Project:**
- Go to https://console.firebase.google.com/
- Click "Create a new Firebase project"
- Click "Add Firebase to Google Cloud project"
- Select your existing Google Cloud project from the dropdown
- Follow the remaining setup steps (you can skip Google Analytics if not needed)
- Verify the project is correctly linked by checking the project ID matches your GCP project

After linking Firebase, continue with the setup:

Choose a location for your Firestore database:
- Multi-region options: `nam5` (US), `eur3` (Europe)
- Regional options: `us-central1`, `europe-west1`, etc.
- Full list: https://firebase.google.com/docs/firestore/locations

```bash
# Set your configuration values
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export DATABASE_ID="YOUR_DATABASE_ID"  # e.g., "capricorn-prod", "capricorn-dev"
export DATABASE_LOCATION="YOUR_LOCATION"  # e.g., "nam5" for US multi-region
export FUNCTION_REGION="YOUR_FUNCTION_REGION"  # e.g., "us-central1" for Cloud Functions deployment
export VERTEX_REGION="global"  # Use "global" for Vertex AI/Gemini access

# Enable required APIs
gcloud services enable \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  dlp.googleapis.com \
  aiplatform.googleapis.com \
  bigquery.googleapis.com \
  --project=$PROJECT_ID

# Grant Cloud Build service account the required permissions
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"
```

**5. Grant Cloud Functions service account required permissions:**

Cloud Functions use the default compute service account which needs access to various services:

```bash
# Get the service account email
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Firestore access (for chat storage)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/datastore.user"

# Grant BigQuery access (for querying embeddings and journal data)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.dataViewer"

# Grant BigQuery connection user access (required for text embeddings)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.connectionUser"

# Grant DLP access (for PII redaction)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/dlp.user"

# Grant Vertex AI access (for Gemini models and embeddings)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/aiplatform.user"
```

These permissions allow the Cloud Functions to:
- Read/write to Firestore for storing chat conversations
- Query BigQuery for article embeddings and journal data
- Use DLP API for redacting sensitive information
- Access Vertex AI for Gemini models and text embeddings

**6. Create the database:**
```bash
# Create the Firestore database
gcloud firestore databases create \
  --database=$DATABASE_ID \
  --location=$DATABASE_LOCATION \
  --project=$PROJECT_ID
```

**7. After creating the database, update the frontend configuration:**
```bash
cd frontend
cp .env.example .env
# Edit .env and set:
# REACT_APP_FIREBASE_DATABASE_ID=your-database-id
```

**Note**: Backend configuration will be handled in the next section using the setup script.

**8. Configure and deploy Firestore security rules:**

First, update the `firebase.json` to specify the database ID:

```bash
cd frontend

# Update firebase.json to include the database ID
# The file should have this structure:
cat > firebase.json << EOF
{
  "hosting": {
    "site": "<app-nickname-in-step-4.1.2 Find Your Configuration>",
    "public": "build",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "database": "$DATABASE_ID"
  }
}
EOF
```

Then deploy the security rules to the specific database:

```bash
firebase deploy --only firestore:rules --project $PROJECT_ID
```

The security rules in `firestore.rules` allow authenticated users to read/write their own chats:
```
match /chats/{userId}/conversations/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### 2. BigQuery Setup

The application requires BigQuery datasets with PubMed article embeddings and metadata. Set these up before deploying Cloud Functions.

#### 2.1 Create Text Embedding Model

The application uses BigQuery ML to create text embeddings for searching PubMed articles. Create the embedding model:

```bash
# Create the model dataset and text embedding model
bq query --use_legacy_sql=false \
"CREATE SCHEMA IF NOT EXISTS \`$PROJECT_ID.model\`
OPTIONS(location='US');

CREATE MODEL IF NOT EXISTS \`$PROJECT_ID.model.gemini_embedding_001\`
REMOTE WITH CONNECTION DEFAULT
OPTIONS(endpoint='gemini-embedding-001');"

# Verify the model was created
bq show --model $PROJECT_ID:model.gemini_embedding_001
```

This creates:
- A dataset called `model` in the US location
- A text embedding model using Google's `text-embedding-005` endpoint

#### 2.2 Journal Impact Factor Dataset Setup

The application uses journal impact factor data (SJR scores) to rank articles. The repository includes a pre-downloaded SCImago Journal Rank CSV file.

**Create the journal_rank dataset:**

```bash
# Create the journal_rank dataset
bq query --use_legacy_sql=false \
"CREATE SCHEMA IF NOT EXISTS \`$PROJECT_ID.journal_rank\`
OPTIONS(location='US');"
```

**Load the journal data into BigQuery:**

```bash
# Install required dependencies
pip install google-cloud-bigquery

# Navigate to the function directory and run the loading script
cd backend/capricorn-retrieve-full-articles
python load_journal_data_to_bq.py \
  --project-id $PROJECT_ID \
  --dataset-id journal_rank \
  --table-id scimagojr_2024 \
  --csv-file scimagojr_2024.csv
```

This script will:
- Create a `journal_rank` dataset if it doesn't exist
- Load the SCImago journal data into a table named `scimagojr_2024`
- Display sample data and confirm successful loading

**Verify the data loaded correctly:**
```bash
# Check the record count (should show ~29,000+ journals)
bq query --use_legacy_sql=false \
"SELECT COUNT(*) as journal_count FROM \`$PROJECT_ID.journal_rank.scimagojr_2024\`"
```

### 3. Cloud Functions Setup

Each Cloud Function needs to be deployed with the appropriate environment variables:

#### 3.1 Create Backend Configuration

Use the provided setup script to create all `.env.yaml` files:

```bash
# If you've already set the environment variables in section 1, the script will use them
# Otherwise, it will prompt you for the required values
./setup-backend-config.sh
```

This creates `.env.yaml` files for all Cloud Functions:
- `backend/capricorn-chat/.env.yaml`
- `backend/capricorn-redact-sensitive-info/.env.yaml`
- `backend/capricorn-process-lab/.env.yaml`
- `backend/capricorn-retrieve-full-articles/.env.yaml`
- `backend/capricorn-final-analysis/.env.yaml`
- `backend/capricorn-feedback/.env.yaml`
- `backend/pubmed-search-tester-extract-disease/.env.yaml`
- `backend/pubmed-search-tester-extract-events/.env.yaml`

**Note**: The `.env.yaml` files are already in `.gitignore` to prevent committing sensitive data.

#### 3.2 Deploy Cloud Functions

Deploy each function with its configuration:

```bash
# Deploy all functions
cd backend

# Redact Sensitive Info
cd capricorn-redact-sensitive-info
gcloud functions deploy redact-sensitive-info \
  --gen2 \
  --runtime=python312 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=redact_sensitive_info \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file=.env.yaml

# Process Lab
cd ../capricorn-process-lab
gcloud functions deploy process-lab \
  --gen2 \
  --runtime=python313 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=process_lab \
  --trigger-http \
  --allow-unauthenticated \
  --cpu=4 \
  --memory=4Gi \
  --timeout=3600s \
  --max-instances=100 \
  --min-instances=1 \
  --concurrency=80 \
  --env-vars-file=.env.yaml

# Retrieve Full Articles
cd ../capricorn-retrieve-full-articles
gcloud functions deploy retrieve-full-articles-live-pmc-gemini-embedding-001 \
  --gen2 \
  --runtime=python312 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=retrieve_full_articles \
  --trigger-http \
  --allow-unauthenticated \
  --cpu=6 \
  --memory=8Gi \
  --timeout=3600s \
  --max-instances=100 \
  --concurrency=1 \
  --env-vars-file=.env.yaml

# Final Analysis
cd ../capricorn-final-analysis
gcloud functions deploy final-analysis-gemini-embedding-001 \
  --gen2 \
  --runtime=python312 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=final_analysis \
  --trigger-http \
  --allow-unauthenticated \
  --cpu=6 \
  --memory=8Gi \
  --timeout=3600s \
  --max-instances=100 \
  --concurrency=1 \
  --env-vars-file=.env.yaml

# Chat
cd ../capricorn-chat
gcloud functions deploy chat \
  --gen2 \
  --runtime=python312 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=chat \
  --trigger-http \
  --allow-unauthenticated \
  --cpu=8 \
  --memory=8Gi \
  --timeout=3600s \
  --max-instances=100 \
  --concurrency=1 \
  --env-vars-file=.env.yaml

# Feedback
cd ../capricorn-feedback
gcloud functions deploy send-feedback-email \
  --gen2 \
  --runtime=python39 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=send_feedback_email \
  --trigger-http \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=512Mi \
  --timeout=300s \
  --max-instances=100 \
  --concurrency=80 \
  --env-vars-file=.env.yaml

# Extract Disease
cd ../pubmed-search-tester-extract-disease
gcloud functions deploy extract-disease \
  --gen2 \
  --runtime=python312 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=extract_disease \
  --trigger-http \
  --allow-unauthenticated \
  --cpu=2 \
  --memory=1Gi \
  --timeout=600s \
  --max-instances=100 \
  --concurrency=1 \
  --env-vars-file=.env.yaml

# Extract Events
cd ../pubmed-search-tester-extract-events
gcloud functions deploy extract-events \
  --gen2 \
  --runtime=python312 \
  --region=$FUNCTION_REGION \
  --source=. \
  --entry-point=extract_events \
  --trigger-http \
  --allow-unauthenticated \
  --cpu=2 \
  --memory=1Gi \
  --timeout=600s \
  --max-instances=100 \
  --concurrency=1 \
  --env-vars-file=.env.yaml
```

#### 3.3 Collect Function URLs and Update Frontend

After deploying all functions, collect their URLs and automatically update the frontend:

```bash
# Navigate back to project root
cd ../..

# Use the FUNCTION_REGION from section 1 or set it now
export REGION=$FUNCTION_REGION

# Collect all function URLs
echo "Collecting Cloud Function URLs..."
REDACT_URL=$(gcloud functions describe redact-sensitive-info --region=$REGION --format='value(serviceConfig.uri)')
PROCESS_LAB_URL=$(gcloud functions describe process-lab --region=$REGION --format='value(serviceConfig.uri)')
RETRIEVE_ARTICLES_URL=$(gcloud functions describe retrieve-full-articles-live-pmc-gemini-embedding-001 --region=$REGION --format='value(serviceConfig.uri)')
FINAL_ANALYSIS_URL=$(gcloud functions describe final-analysis-gemini-embedding-001 --region=$REGION --format='value(serviceConfig.uri)')
CHAT_URL=$(gcloud functions describe chat --region=$REGION --format='value(serviceConfig.uri)')
FEEDBACK_URL=$(gcloud functions describe send-feedback-email --region=$REGION --format='value(serviceConfig.uri)')
EXTRACT_DISEASE_URL=$(gcloud functions describe extract-disease --region=$REGION --format='value(serviceConfig.uri)')
EXTRACT_EVENTS_URL=$(gcloud functions describe extract-events --region=$REGION --format='value(serviceConfig.uri)')

# Save URLs to file for reference
{
  echo "# Cloud Function URLs - Generated $(date)"
  echo "REDACT_URL=$REDACT_URL"
  echo "PROCESS_LAB_URL=$PROCESS_LAB_URL"
  echo "RETRIEVE_ARTICLES_URL=$RETRIEVE_ARTICLES_URL"
  echo "FINAL_ANALYSIS_URL=$FINAL_ANALYSIS_URL"
  echo "CHAT_URL=$CHAT_URL"
  echo "FEEDBACK_URL=$FEEDBACK_URL"
  echo "EXTRACT_DISEASE_URL=$EXTRACT_DISEASE_URL"
  echo "EXTRACT_EVENTS_URL=$EXTRACT_EVENTS_URL"
} > function-urls.txt

# Update api.js with the correct URLs
# Note: The API_BASE_URL is used for multiple functions, so we'll use the Chat function's base URL
API_BASE_URL=$(echo $CHAT_URL | sed 's|/chat$||')

# Update the hardcoded URLs in api.js
sed -i.bak "s|const API_BASE_URL = .*|const API_BASE_URL = '$API_BASE_URL';|" frontend/src/utils/api.js
sed -i.bak "s|https://capricorn-feedback-[^']*|$FEEDBACK_URL|" frontend/src/utils/api.js
sed -i.bak "s|https://capricorn-process-lab-[^']*|$PROCESS_LAB_URL|" frontend/src/utils/api.js

echo "✓ Updated frontend/src/utils/api.js with Cloud Function URLs"
echo "✓ Saved URLs to function-urls.txt for reference"
```

### 4. Frontend Configuration

#### 4.1 Get Firebase Configuration Values

1. **Access Firebase Console**:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project or select your existing GCP project
   - If creating new, link it to your GCP project when prompted

2. **Find Your Configuration**:
   - Click the gear icon ⚙️ → "Project settings"
   - Scroll down to "Your apps" section
   - If no app exists, click "Add app" → Choose Web (</>)
   - Register your app with a nickname (e.g., "capricorn-medical")
   - You'll see your Firebase configuration:
   ```javascript
   const firebaseConfig = {
     apiKey: "...",              // → REACT_APP_FIREBASE_API_KEY
     authDomain: "...",          // → REACT_APP_FIREBASE_AUTH_DOMAIN
     projectId: "...",           // → REACT_APP_FIREBASE_PROJECT_ID
     storageBucket: "...",       // → REACT_APP_FIREBASE_STORAGE_BUCKET
     messagingSenderId: "...",   // → REACT_APP_FIREBASE_MESSAGING_SENDER_ID
     appId: "..."                // → REACT_APP_FIREBASE_APP_ID
   };
   ```

#### 4.2 Create Environment Configuration

```bash
cd frontend

# Create .env file (already in .gitignore)
cat > .env << EOF
REACT_APP_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID=YOUR_APP_ID
REACT_APP_FIREBASE_DATABASE_ID=YOUR_DATABASE_ID
EOF
```

Replace the placeholders with your actual values from the Firebase configuration. Use the `DATABASE_ID` you created in section 1 (e.g., "capricorn-prod")

#### 4.3 Update Firebase Hosting Configuration

Update `firebase.json` with your project ID:
```bash
# Get the project ID from the .env file
PROJECT_ID=$(grep REACT_APP_FIREBASE_PROJECT_ID .env | cut -d '=' -f2)

# Update firebase.json with the project ID or app nickname you specified in 2. Find Your Configuration
sed -i.bak "s|\"site\": \".*\"|\"site\": \"$PROJECT_ID\"|" firebase.json

echo "✓ Updated firebase.json with site name: $PROJECT_ID"
```

#### 4.4 Configure Firebase Authentication

Before deploying, you need to configure Firebase Authentication:

1. **Enable Authentication Providers**:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Navigate to "Authentication" → "Sign-in method"
   
   **Enable Google Authentication:**
   - Click on "Google" provider
   - Toggle "Enable" to ON
   - Select a support email for the project
   - Click "Save"
   
   **Enable Anonymous Authentication:**
   - Click on "Anonymous" provider
   - Toggle "Enable" to ON
   - Click "Save"
   
   This allows users to either sign in with their Google account or use the app anonymously.

2. **Add Authorized Domains**:
   - Still in "Authentication" → "Settings" tab
   - Under "Authorized domains", add:
     - `localhost` (for local development)
     - Your Firebase Hosting domain: `YOUR-APP-NICKNAME.web.app` (e.g., "capricorn-medical.web.app")
     - Your custom domain (if applicable)
     - Any other domains where you'll host the app
   
   **Important**: Any domain where your app is hosted must be added to this list, otherwise authentication will fail with a redirect_uri_mismatch error.

3. **Configure OAuth Consent Screen** (if prompted):
   - Choose "External" user type (unless using Workspace)
   - Fill in the required application information
   - Add your app domains to authorized domains
   - Save the configuration

### 5. Deploy Frontend

1. Build the application:
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. Deploy to Firebase Hosting:
   ```bash
   # Deploy using the existing firebase.json configuration
   firebase deploy --only hosting --project $PROJECT_ID
   ```
