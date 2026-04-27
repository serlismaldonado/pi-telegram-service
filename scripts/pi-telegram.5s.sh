#!/bin/bash

PM2="$HOME/.npm-global/bin/pm2"
# fallback paths
[ ! -f "$PM2" ] && PM2="/usr/local/bin/pm2"
[ ! -f "$PM2" ] && PM2="$(which pm2 2>/dev/null)"

STATUS=$("$PM2" jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    p = next((x for x in procs if x['name'] == 'pi-telegram'), None)
    if p:
        s = p['pm2_env']['status']
        restarts = p['pm2_env']['restart_time']
        mem = p['monit']['memory'] // 1024 // 1024
        print(f'{s}|{restarts}|{mem}')
    else:
        print('not found||')
except:
    print('error||')
" 2>/dev/null)

STATE=$(echo "$STATUS" | cut -d'|' -f1)
RESTARTS=$(echo "$STATUS" | cut -d'|' -f2)
MEM=$(echo "$STATUS" | cut -d'|' -f3)

if [ "$STATE" = "online" ]; then
    ICON="🟢"
elif [ "$STATE" = "stopped" ]; then
    ICON="🔴"
elif [ "$STATE" = "errored" ]; then
    ICON="🔴"
else
    ICON="🟡"
fi

echo "$ICON Pi Bot"
echo "---"
echo "Status: $STATE | refresh=true"
[ -n "$MEM" ] && echo "RAM: ${MEM} MB | refresh=true"
[ -n "$RESTARTS" ] && echo "Restarts: $RESTARTS | refresh=true"
echo "---"
echo "🔄 Restart | bash=$PM2 param1=restart param2=pi-telegram terminal=false refresh=true"
echo "⏹ Stop | bash=$PM2 param1=stop param2=pi-telegram terminal=false refresh=true"
echo "▶️ Start | bash=$PM2 param1=start param2=pi-telegram terminal=false refresh=true"
echo "---"
echo "📋 View logs | bash=/usr/bin/osascript param1=-e param2='tell app \"Terminal\" to do script \"pm2 logs pi-telegram\"' terminal=false"
