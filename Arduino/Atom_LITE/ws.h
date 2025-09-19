#pragma once

// WebSocket service API with encapsulated state
struct AppState {
  volatile bool estop = false;
  float L_cmd = 0.0f;  // -1..+1
  float R_cmd = 0.0f;  // -1..+1
};

class WsServer {
public:
  virtual void begin();
  virtual void loop();
  virtual void maybeHeartbeat();
  virtual const AppState& state() const;
private:
  // opaque; implementation lives in ws.cpp
};

// Access the singleton WebSocket service
WsServer& WS();
