# ASCII Aquarium for Arduino UNO Q - Linux (MPU) side.
#
#  * Serves the full ASCII aquarium (assets/) through the WebUI brick.
#  * Runs a tiny 8x13 aquarium of its own and streams it to the LED matrix
#    on the MCU through the Bridge, so the board itself is part of the tank.
#  * Feeding the fish in the browser also drops food on the LED matrix.

import math
import random
import threading
import time

import numpy as np

from arduino.app_utils import App, Bridge, Frame
from arduino.app_bricks.web_ui import WebUI

ROWS, COLS = 8, 13
FPS = 12


class MatrixTank:
    """A very small aquarium: fish chase food, bubbles rise, weeds sway."""

    def __init__(self):
        self.lock = threading.Lock()
        self.enabled = True
        self.fish = [self._new_fish() for _ in range(3)]
        self.bubbles = [[random.uniform(0, COLS), random.uniform(0, ROWS)] for _ in range(3)]
        self.flakes = []  # [x, y]

    @staticmethod
    def _new_fish():
        direction = random.choice((-1, 1))
        return {
            "x": random.uniform(0, COLS),
            "y": random.uniform(1, ROWS - 3),
            "dir": direction,
            "speed": random.uniform(1.2, 2.8),
            "bright": random.choice((4, 5, 7)),
            "phase": random.uniform(0, 6.28),
        }

    def feed(self, count=4):
        with self.lock:
            for _ in range(count):
                if len(self.flakes) < 12:
                    self.flakes.append([random.uniform(1, COLS - 1), random.uniform(-3, 0)])

    def set_enabled(self, enabled):
        self.enabled = bool(enabled)

    def step(self, dt, t):
        with self.lock:
            for fl in self.flakes:
                fl[1] += 2.2 * dt
            for fish in self.fish:
                target = None
                best = 99.0
                for fl in self.flakes:
                    d = abs(fl[0] - fish["x"]) + abs(fl[1] - fish["y"])
                    if 0 <= fl[1] < ROWS and d < best:
                        best, target = d, fl
                speed = fish["speed"]
                if target is not None:
                    fish["dir"] = 1 if target[0] >= fish["x"] else -1
                    fish["y"] += max(-1.5, min(1.5, target[1] - fish["y"])) * dt * 2
                    speed *= 1.6
                    if best < 1.2:
                        self.flakes.remove(target)
                else:
                    fish["y"] += math.sin(t * 0.8 + fish["phase"]) * 0.6 * dt
                fish["y"] = max(0.0, min(ROWS - 3.0, fish["y"]))
                fish["x"] += fish["dir"] * speed * dt
                if fish["x"] > COLS + 2:
                    fish["x"] = -2
                elif fish["x"] < -2:
                    fish["x"] = COLS + 2
            for b in self.bubbles:
                b[1] -= 1.6 * dt
                if b[1] < -1:
                    b[0] = random.uniform(0, COLS)
                    b[1] = ROWS + random.uniform(0, 2)
            self.flakes = [fl for fl in self.flakes if fl[1] < ROWS - 1]

    def render(self, t):
        grid = np.zeros((ROWS, COLS), dtype=np.uint8)
        if not self.enabled:
            return grid
        with self.lock:
            # seaweed along the bottom
            for x in range(1, COLS, 3):
                sway = int(round(math.sin(t * 1.3 + x)))
                grid[ROWS - 1, x] = 2
                grid[ROWS - 2, min(COLS - 1, max(0, x + sway))] = 2
                if x % 2 == 1:
                    grid[ROWS - 3, min(COLS - 1, max(0, x + sway * 2))] = 1
            for bx, by in self.bubbles:
                x, y = int(bx), int(by)
                if 0 <= x < COLS and 0 <= y < ROWS:
                    grid[y, x] = max(grid[y, x], 3)
            for fish in self.fish:
                x, y = int(round(fish["x"])), int(round(fish["y"]))
                head = x + (1 if fish["dir"] > 0 else 0)
                tail = x + (0 if fish["dir"] > 0 else 1)
                if 0 <= y < ROWS:
                    if 0 <= head < COLS:
                        grid[y, head] = fish["bright"]
                    if 0 <= tail < COLS:
                        grid[y, tail] = max(1, fish["bright"] - 3)
            for fx, fy in self.flakes:
                x, y = int(fx), int(fy)
                if 0 <= x < COLS and 0 <= y < ROWS:
                    grid[y, x] = 7
        return grid


tank = MatrixTank()


def matrix_loop():
    last = time.time()
    while True:
        now = time.time()
        dt = min(0.1, now - last)
        last = now
        try:
            tank.step(dt, now)
            frame = Frame(tank.render(now))
            Bridge.call("draw", frame.to_board_bytes())
        except Exception as exc:  # keep the tank alive even if the MCU hiccups
            print(f"LED matrix update failed: {exc}")
            time.sleep(1.0)
        time.sleep(max(0.0, 1.0 / FPS - (time.time() - now)))


ui = WebUI()
ui.on_message("feed", lambda sid, data: tank.feed())
ui.on_message("matrix", lambda sid, data: tank.set_enabled((data or {}).get("enabled", True)))

threading.Thread(target=matrix_loop, daemon=True).start()

App.run()  # blocks until the app is stopped
