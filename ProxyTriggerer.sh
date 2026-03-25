#!/bin/bash

# Configuration
TARGET_URL="https://www.google.com"
BOT_COMMAND="node testbot.js"
INTERVAL=60 # seconds

echo "Starting 24/7 Proxy Monitor..."

while true
do
    echo "[$(date '+%H:%M:%S')] Checking proxy connection..."

    # Use curl to check if the connection is active
    # --silent hides progress, --head only fetches headers to save data
    # --fail returns a non-zero exit code if the request fails
    if curl --silent --head --fail "$TARGET_URL" > /dev/null; then
        echo "✅ Proxy is UP. Triggering bot..."
        
        # Run the bot and wait for it to finish
        $BOT_COMMAND
        
        echo "Bot finished. Waiting $INTERVAL seconds for next check."
    else
        echo "❌ Proxy is DOWN or connection failed. Retrying in $INTERVAL seconds..."
    fi

    sleep $INTERVAL
done
