#!/bin/bash

# --- CONFIGURATION ---
MIN_SLEEP=300       # 5 Minutes (in seconds)
MAX_SLEEP=10800     # 3 Hours (in seconds)
TOTAL_DURATION=86400 # 24 Hours (in seconds)

START_TIME=$(date +%s)
END_TIME=$((START_TIME + TOTAL_DURATION))

echo "🌕 [Eternal Ghost] 24-Hour Human Simulation Started..."
echo "⏰ End Time: $(date -d @$END_TIME)"

while [ $(date +%s) -lt $END_TIME ]; do
    # 1. Generate random number of sessions (1 to 9)
    RUN_COUNT=$((1 + RANDOM % 9))
    
    echo "---------------------------------------------------"
    echo "🎰 New Traffic Wave: Running $RUN_COUNT sessions now."
    echo "---------------------------------------------------"

    # 2. Execute the Bot Loop
    for i in $(seq 1 $RUN_COUNT); do
        echo "👤 Starting Session #$i of $RUN_COUNT..."
        node testbot.js "https://www.learnblogs.online" "https://x.com/GhostReacondev/status/2024921591520641247?s=20" 10 2 6
        
        # Short human pause between sessions (30s to 2mins)
        INTER_SESSION_PAUSE=$((30 + RANDOM % 90))
        sleep $INTER_SESSION_PAUSE
    done

    # 3. CALCULATE THE "HUMAN NAP" (The long random wait)
    # This picks a random time between 5 mins and 3 hours
    SLEEP_TIME=$((MIN_SLEEP + RANDOM % (MAX_SLEEP - MIN_SLEEP)))
    
    # Calculate what time we will wake up
    WAKE_UP_TIME=$(date -d "+$SLEEP_TIME seconds" +"%H:%M:%S")
    
    echo "---------------------------------------------------"
    echo "😴 Human Nap: Sleeping for $((SLEEP_TIME / 60)) minutes."
    echo "🕒 Next wave will trigger at: $WAKE_UP_TIME"
    echo "---------------------------------------------------"

    sleep $SLEEP_TIME
done

echo "☀️ 24-Hour cycle complete. Traffic generation finished."
