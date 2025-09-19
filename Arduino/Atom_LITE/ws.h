#pragma once

#include <WebSocketsServer.h>

struct AppState {
  volatile bool estop = false;
  float L_cmd = 0.0f;  // -1..+1
  float R_cmd = 0.0f;  // -1..+1
};

extern WebSocketsServer ws;
extern AppState app;

void wsBegin();
void wsLoop();
void wsMaybeHeartbeat();

