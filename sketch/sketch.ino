// ASCII Aquarium for Arduino UNO Q - MCU side.
// Python (Linux side) simulates a tiny aquarium and sends 8x13 frames here
// through the Bridge. This sketch just shows the latest frame on the LED matrix.

#include <Arduino_RouterBridge.h>
#include <Arduino_LED_Matrix.h>
#include <vector>

Arduino_LED_Matrix matrix;

const uint8_t FRAME_ROWS = 8;
const uint8_t FRAME_COLS = 13;
const uint8_t FRAME_SIZE = FRAME_ROWS * FRAME_COLS;

uint8_t frame[FRAME_SIZE] = {0};

void draw(std::vector<uint8_t> newFrame) {
  size_t len = min(newFrame.size(), (size_t)FRAME_SIZE);
  memcpy(frame, newFrame.data(), len);
}

void setup() {
  matrix.begin();
  matrix.setGrayscaleBits(3);  // brightness 0-7
  matrix.clear();
  Bridge.begin();
  Bridge.provide("draw", draw);
}

void loop() {
  matrix.draw(frame);
  delay(10);
}
