// M5Atom LITE (ESP32) - Dual Motor PH/EN over WebSocket
// WebSocket: ws://<IP>:81/
// Commands (JSON text, one per message):
//   {"v":1,"cmd":"drive","L":0.75,"R":-0.40}
//   {"v":1,"cmd":"estop","on":true}
//   {"v":1,"cmd":"reset"}
//   {"v":1,"cmd":"ping"}
// ACK/heartbeat:
//   {"ok":true,"ts":123456,"L":0.75,"R":-0.40,"estop":false}

#include <Arduino.h>
#include <M5AtomS3.h>
#include "config_pins.h"   // Hardware mapping lives here
#include "motor.h"
#include "net.h"
#include "ws.h"

void setup() {
  // Initialize M5Atom S3
  AtomS3.begin(true);
  // Indicate startup
  AtomS3.dis.setBrightness(100);
  // Red during init
  AtomS3.dis.drawpix(0xff0000);
  AtomS3.update();

  Serial.begin(115200);
  delay(200);

  // Initialize motors
  motorInit(L_PHASE, L_EN, R_PHASE, R_EN, PWM_RES_BITS, PWM_FREQ_HZ);
  // Initialize network
  wifiConnect();
  // Initialize WebSocket server
  WS().begin();

  // Indicate ready
  // Green when ready
  AtomS3.dis.drawpix(0x00ff00);
  AtomS3.update();
}

void loop() {
  WS().loop();

  const AppState& wsState = WS().state();  // WebSocket-side application state
  if (wsState.estop) {
    stopAll();
  } else {
    // Apply motor outputs using configured pins (hidden in motor module)
    applyMotors(wsState.L_cmd, wsState.R_cmd);
  }

  WS().maybeHeartbeat();
  delay(1); // yield CPU
}
