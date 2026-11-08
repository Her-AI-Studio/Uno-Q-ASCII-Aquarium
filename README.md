# ASCII Aquarium for Arduino UNO Q

The ASCII Aquarium, ported from the ESP32 CYD firmware to an **Arduino App Lab** app. Original idea from https://github.com/POWER-PILL/ASCII-Aquarium.

| Where | What |
|---|---|
| **Browser / monitor** (served by the UNO Q) | The full tank: 12 fish species with schooling, food chasing, bubbles, swaying seaweed, octopus (and a rare Cthulhu), seahorse, snail, jellyfish, backgrounds (black, dithered, smooth, flowers, Auto Sky, rainbow), small and large ASCII clocks, auto-feed. |
| **8x13 LED matrix** (on the board) | A tiny tank of its own. Feeding the fish in the browser drops food on the matrix too. |

## Run it
1. Copy this folder into your App Lab apps (or import it), open it, press **Run**.
2. Open the URL App Lab prints (port 7000, e.g. `http://<your-uno-q>.local:7000`) in any browser on your network, or open it in the browser on a monitor plugged into the UNO Q and press **Enter** for fullscreen.

## Controls
Click or tap the glass to feed. `F` feed, `S` settings, `Enter` fullscreen, `O` octopus, `H` seahorse, `N` snail, `J` jellyfish. A gear appears in the top-right corner when the mouse moves or you touch the screen. Settings are saved in the browser.

## Layout
```
app.yaml            App Lab manifest (uses the web_ui brick)
python/main.py      serves the UI, simulates + streams the LED matrix frames
sketch/sketch.ino   MCU side: shows the latest frame on the LED matrix
assets/             the aquarium (index.html, app.js, style.css, libs/)
```

## Differences from the CYD firmware
- No touch calibration, SD capture, Wi-Fi panel or backlight/RGB-LED control; the UNO Q has Linux and a network connection, so the clock uses the system time.
- The tank width follows the screen's aspect ratio instead of a fixed 320x240.
- Squid is left out, as in the CYD release (disabled there).
