#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsServer.h>
#include "ws.h"
#include "motor.h"

class WsServerImpl : public WsServer {
public:
  void begin() override {
    ws.begin();
    ws.onEvent([this](uint8_t num, WStype_t type, uint8_t* payload, size_t len) {
      switch (type) {
        case WStype_CONNECTED: {
          IPAddress ip = ws.remoteIP(num);
          Serial.printf("[WS] client #%u connected from %s\n", num, ip.toString().c_str());
          StaticJsonDocument<128> res;
          res["ok"]=true; res["hello"]=true; res["ts"]=millis(); res["estop"]=app.estop;
          String out; serializeJson(res, out);
          ws.sendTXT(num, out);
          break;
        }
        case WStype_DISCONNECTED:
          Serial.printf("[WS] client #%u disconnected\n", num);
          break;
        case WStype_TEXT: {
          String s; s.reserve(len);
          for (size_t i=0;i<len;i++) s += (char)payload[i];
          handleMessage(num, s);
          break;
        }
        default: break;
      }
    });
    Serial.println("WebSocket server started on :81");
  }

  void loop() override { ws.loop(); }

  void maybeHeartbeat() override {
    unsigned long now = millis();
    if (now - lastBeatMs >= HEARTBEAT_MS) {
      lastBeatMs = now;
      StaticJsonDocument<160> hb;
      hb["ok"]=true; hb["ts"]=now; hb["L"]=app.L_cmd; hb["R"]=app.R_cmd; hb["estop"]=app.estop;
      String out; serializeJson(hb, out);
      ws.broadcastTXT(out);
    }
  }

  const AppState& state() const override { return app; }

private:
  void handleMessage(uint8_t num, const String& payload) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
      StaticJsonDocument<96> res;
      res["ok"] = false;
      res["err"] = "bad_json";
      String out; serializeJson(res, out);
      ws.sendTXT(num, out);
      return;
    }

    const char* cmd = doc["cmd"] | "";
    if (!strcmp(cmd, "drive")) {
      float L = doc["L"] | 0.0;
      float R = doc["R"] | 0.0;
      if (!app.estop) {
        app.L_cmd = clampf(L, -1.0f, 1.0f);
        app.R_cmd = clampf(R, -1.0f, 1.0f);
      }
    } else if (!strcmp(cmd, "estop")) {
      bool on = doc["on"] | true;
      app.estop = on;
      if (app.estop) { stopAll(); }
    } else if (!strcmp(cmd, "reset")) {
      app.estop = false;
      app.L_cmd = 0; app.R_cmd = 0;
      stopAll();
    } else if (!strcmp(cmd, "ping") || !strcmp(cmd, "hello")) {
      // no-op
    }

    StaticJsonDocument<160> res;
    res["ok"] = true;
    res["ts"] = millis();
    res["L"] = app.L_cmd;
    res["R"] = app.R_cmd;
    res["estop"] = app.estop;
    String out; serializeJson(res, out);
    ws.sendTXT(num, out);
  }

  WebSocketsServer ws{81};
  AppState app;
  unsigned long lastBeatMs = 0;
  static const unsigned long HEARTBEAT_MS = 5000;  // 5s
};

static WsServerImpl g_ws;

WsServer& WS() { return g_ws; }
