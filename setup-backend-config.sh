#!/bin/bash

# Setup script for Capricorn Medical Research backend configuration
# This script creates .env.yaml files for all Cloud Functions

echo "=================================================="
echo "Capricorn Medical Research - Backend Configuration"
echo "=================================================="
echo ""
echo "This script will create .env.yaml files for all Cloud Functions."
echo "You'll be prompted for common values once."
echo ""

# Check for existing environment variables or prompt for values
if [ -z "$PROJECT_ID" ]; then
    read -p "Enter your GCP Project ID: " PROJECT_ID
else
    echo "Using PROJECT_ID from environment: $PROJECT_ID"
fi

if [ -z "$DATABASE_ID" ]; then
    read -p "Enter your Firestore Database ID (e.g., capricorn-prod): " DATABASE_ID
else
    echo "Using DATABASE_ID from environment: $DATABASE_ID"
fi

# Function deployment region
if [ -z "$FUNCTION_REGION" ]; then
    read -p "Enter your Cloud Functions deployment region (e.g., us-central1): " FUNCTION_REGION
else
    echo "Using FUNCTION_REGION from environment: $FUNCTION_REGION"
fi

# Vertex AI region (usually 'global' for Gemini models)
if [ -z "$VERTEX_REGION" ]; then
    VERTEX_REGION="global"
    echo "Using default VERTEX_REGION: $VERTEX_REGION"
else
    echo "Using VERTEX_REGION from environment: $VERTEX_REGION"
fi

# Use same project for BigQuery
BIGQUERY_PROJECT_ID=$PROJECT_ID

# Hardcoded dataset names
MODEL_DATASET="model"
JOURNAL_DATASET="journal_rank"

echo "Using BigQuery configuration:"
echo "  - BigQuery Project: $BIGQUERY_PROJECT_ID"
echo "  - Model Dataset: $MODEL_DATASET"
echo "  - Journal Dataset: $JOURNAL_DATASET"

# Optional: Prompt for SendGrid API key
echo ""
echo "SendGrid API key is required for the feedback function."
echo "You can enter it now or add it manually later to backend/capricorn-feedback/.env.yaml"
read -p "Enter your SendGrid API key (optional, press Enter to skip): " SENDGRID_API_KEY

echo ""
echo "Creating configuration files..."

# Create capricorn-chat/.env.yaml
cat > backend/capricorn-chat/.env.yaml << EOF
# Environment variables for capricorn-chat Cloud Function
PROJECT_ID: "$PROJECT_ID"
DATABASE_ID: "$DATABASE_ID"
LOCATION: "$VERTEX_REGION"
EOF
echo "✓ Created backend/capricorn-chat/.env.yaml"

# Create capricorn-redact-sensitive-info/.env.yaml
cat > backend/capricorn-redact-sensitive-info/.env.yaml << EOF
# Environment variables for capricorn-redact-sensitive-info Cloud Function
PROJECT_ID: "$PROJECT_ID"
DLP_PROJECT_ID: "$PROJECT_ID"  # Using same as PROJECT_ID
LOCATION: "$VERTEX_REGION"
EOF
echo "✓ Created backend/capricorn-redact-sensitive-info/.env.yaml"

# Create capricorn-process-lab/.env.yaml
cat > backend/capricorn-process-lab/.env.yaml << EOF
# Environment variables for capricorn-process-lab Cloud Function
PROJECT_ID: "$PROJECT_ID"
LOCATION: "$VERTEX_REGION"
EOF
echo "✓ Created backend/capricorn-process-lab/.env.yaml"

# Create capricorn-retrieve-full-articles/.env.yaml
cat > backend/capricorn-retrieve-full-articles/.env.yaml << EOF
# Environment variables for capricorn-retrieve-full-articles Cloud Function
GENAI_PROJECT_ID: "$PROJECT_ID"
BIGQUERY_PROJECT_ID: "$BIGQUERY_PROJECT_ID"
LOCATION: "$VERTEX_REGION"
MODEL_DATASET: "$MODEL_DATASET"
JOURNAL_DATASET: "$JOURNAL_DATASET"
EOF
echo "✓ Created backend/capricorn-retrieve-full-articles/.env.yaml"

# Create capricorn-final-analysis/.env.yaml
cat > backend/capricorn-final-analysis/.env.yaml << EOF
# Environment variables for capricorn-final-analysis Cloud Function
GENAI_PROJECT_ID: "$PROJECT_ID"
BIGQUERY_PROJECT_ID: "$BIGQUERY_PROJECT_ID"
LOCATION: "$VERTEX_REGION"
EOF
echo "✓ Created backend/capricorn-final-analysis/.env.yaml"

# Create capricorn-feedback/.env.yaml
if [ -z "$SENDGRID_API_KEY" ]; then
    cat > backend/capricorn-feedback/.env.yaml << EOF
# Environment variables for capricorn-feedback Cloud Function
SENDGRID_API_KEY: "YOUR_SENDGRID_API_KEY"  # TODO: Add your SendGrid API key
EOF
    echo "✓ Created backend/capricorn-feedback/.env.yaml (SendGrid API key needs to be added)"
else
    cat > backend/capricorn-feedback/.env.yaml << EOF
# Environment variables for capricorn-feedback Cloud Function
SENDGRID_API_KEY: "$SENDGRID_API_KEY"
EOF
    echo "✓ Created backend/capricorn-feedback/.env.yaml"
fi

# Create pubmed-search-tester-extract-disease/.env.yaml
cat > backend/pubmed-search-tester-extract-disease/.env.yaml << EOF
# Environment variables for pubmed-search-tester-extract-disease Cloud Function
PROJECT_ID: "$PROJECT_ID"
LOCATION: "$VERTEX_REGION"
EOF
echo "✓ Created backend/pubmed-search-tester-extract-disease/.env.yaml"

# Create pubmed-search-tester-extract-events/.env.yaml
cat > backend/pubmed-search-tester-extract-events/.env.yaml << EOF
# Environment variables for pubmed-search-tester-extract-events Cloud Function
PROJECT_ID: "$PROJECT_ID"
LOCATION: "$VERTEX_REGION"
EOF
echo "✓ Created backend/pubmed-search-tester-extract-events/.env.yaml"

echo ""
echo "=================================================="
echo "Configuration files created successfully!"
echo "=================================================="
echo ""
echo "Summary:"
echo "- Project ID: $PROJECT_ID"
echo "- Database ID: $DATABASE_ID"
echo "- Function Region: $FUNCTION_REGION"
echo "- Vertex AI Region: $VERTEX_REGION"
echo "- BigQuery Project ID: $BIGQUERY_PROJECT_ID"

if [ -z "$SENDGRID_API_KEY" ]; then
    echo ""
    echo "⚠️  Note: Remember to add your SendGrid API key to:"
    echo "   backend/capricorn-feedback/.env.yaml"
fi

echo ""
echo "Next steps:"
echo "1. Review the generated .env.yaml files"
echo "2. Deploy the Cloud Functions using the commands in the README"
echo ""
