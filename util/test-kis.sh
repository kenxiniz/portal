
#!/bin/bash

# Set your App Key and App Secret
APP_KEY=""
APP_SECRET=""

URL_BASE="https://openapi.koreainvestment.com:9443"

echo "[LOG] Starting detailed KIS API diagnostic script..."

# Step 1: Request Access Token
echo "[LOG] Step 1: Requesting Access Token..."
JSON_PAYLOAD=$(cat <<EOF
{
  "grant_type": "client_credentials",
  "appkey": "${APP_KEY}",
  "appsecret": "${APP_SECRET}"
}
EOF
)

TOKEN_RESPONSE=$(curl -s -X POST "${URL_BASE}/oauth2/tokenP" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$ACCESS_TOKEN" ]; then
    echo "[ERROR] Failed to retrieve access token. Raw response:"
    echo "$TOKEN_RESPONSE"
    exit 1
fi
echo "[LOG] Access token successfully extracted."

# Step 2: Test a standard API endpoint (e.g., Current Price Inquiry) with verbose logging
TARGET_ENDPOINT="/uapi/domestic-stock/v1/quotations/inquire-price"
STOCK_CODE="005930"
TR_ID="FHKST01010100"

echo "[LOG] Step 2: Testing target API (Current Price) with verbose logging..."
echo "[LOG] Target URL: ${URL_BASE}${TARGET_ENDPOINT}?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${STOCK_CODE}"
echo "[LOG] TR_ID: ${TR_ID}"
echo "[LOG] Dumping full request and response headers below:"
echo "--------------------------------------------------"

# Execute curl with -v (verbose) to see all headers and raw output
curl -v -X GET "${URL_BASE}${TARGET_ENDPOINT}?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${STOCK_CODE}" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "authorization: Bearer ${ACCESS_TOKEN}" \
  -H "appkey: ${APP_KEY}" \
  -H "appsecret: ${APP_SECRET}" \
  -H "tr_id: ${TR_ID}" \
  -H "custtype: P"

echo ""
echo "--------------------------------------------------"
echo "[LOG] Diagnostic execution completed."