#!/bin/bash

PROJECT_NAME="helmcorp-cc"
ACCOUNT_ID="f07be5f84583d0d100b05aeeae56870b"
EMAIL="johnmobley99@gmail.com"
API_KEY="c70d7a88f87f8cf4b3cfd7971ca482dc9882d"

echo "Building manifest..."

# Create manifest JSON
MANIFEST="{}"
cd src

for file in $(find . -type f); do
  FILE_PATH="${file:2}"  # Remove leading ./
  FILE_HASH=$(openssl dgst -sha256 -hex "$file" | awk '{print $2}')
  MANIFEST=$(echo "$MANIFEST" | jq ".\"$FILE_PATH\" = \"$FILE_HASH\"")
done

echo "Manifest: $MANIFEST"

cd ..

echo "Creating deployment for $PROJECT_NAME..."

# Create a new deployment
DEPLOY_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
  -H "X-Auth-Email: $EMAIL" \
  -H "X-Auth-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"manifest\": $MANIFEST}")

DEPLOYMENT_ID=$(echo $DEPLOY_RESPONSE | jq -r '.result.id')

if [ "$DEPLOYMENT_ID" == "null" ] || [ -z "$DEPLOYMENT_ID" ]; then
  echo "Failed to create deployment"
  echo $DEPLOY_RESPONSE | jq '.'
  exit 1
fi

echo "Deployment created: $DEPLOYMENT_ID"

# Upload files
cd src
for file in $(find . -type f); do
  FILE_PATH="${file:2}"  # Remove leading ./
  
  curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments/$DEPLOYMENT_ID/files" \
    -H "X-Auth-Email: $EMAIL" \
    -H "X-Auth-Key: $API_KEY" \
    -F "files=@${file}" > /dev/null

  echo "Uploaded: $FILE_PATH"
done

cd ..

# Finalize deployment
FINALIZE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments/$DEPLOYMENT_ID/finalize" \
  -H "X-Auth-Email: $EMAIL" \
  -H "X-Auth-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "Deployment finalized"
echo $FINALIZE_RESPONSE | jq '.result.url'
