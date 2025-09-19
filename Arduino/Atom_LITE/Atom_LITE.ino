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
#include "motor.h"
#include "net.h"
#include "ws.h"

void setup() {
  Serial.begin(115200);
  delay(200);

  motorInit();
  wifiConnect();
  wsBegin();
}

void loop() {
  wsLoop();

  if (app.estop) {
    stopAll();
  } else {
    applyMotorPHEN(L_PHASE, L_EN, app.L_cmd);
    applyMotorPHEN(R_PHASE, R_EN, app.R_cmd);
  }

  wsMaybeHeartbeat();
  delay(1); // yield CPU
}
