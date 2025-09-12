// M5Atom LITE (ESP32) - Dual Motor PH/EN over WebSocket
// WebSocket: ws://<IP>:81/
// Commands (JSON text, one per message):
//   {"v":1,"cmd":"drive","L":0.75,"R":-0.40}
//   {"v":1,"cmd":"estop","on":true}
//   {"v":1,"cmd":"reset"}
//   {"v":1,"cmd":"ping"}
// ACK/heartbeat:
//   {"ok":true,"ts":123456,"L":0.75,"R":-0.40,"estop":false}

#include <WiFi.h>
#include <WebSocketsServer.h>  // Links2004/arduinoWebSockets
#include <ArduinoJson.h>       // ArduinoJson 7.x 推奨

// ===== WiFi =====
const char* WIFI_SSID = "S413-iso-g";
const char* WIFI_PASS = "icMU3aQaavPz6Qp2CCxa";

// ===== PH/EN ピン割り当て（必要に応じて変更） =====
// Atom LITE 外部ピンの例: 19, 22, 23, 25, 26, 32, 33 など
// 左モーター
const int L_PHASE = 22;  // 方向
const int L_EN    = 19;  // PWM
// 右モーター
const int R_PHASE = 23;  // 方向
const int R_EN    = 33;  // PWM

// ===== PWM 設定（ESP32 v3系では analogWrite* を推奨） =====
const int PWM_RES_BITS = 10;             // 0..1023
const int PWM_MAX      = (1 << PWM_RES_BITS) - 1;
const int PWM_FREQ_HZ  = 10000;          // 20 kHz（モーター用に聞こえづらい帯域）

// ===== アプリ状態 =====
WebSocketsServer ws(81);
volatile bool estop = false;
float L_cmd = 0.0f;  // -1.0 .. +1.0
float R_cmd = 0.0f;

unsigned long lastBeatMs = 0;
const unsigned long HEARTBEAT_MS = 500;

// ===== ユーティリティ =====
static inline int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

// val: -1..+1
void applyMotorPHEN(int phasePin, int enPin, float val) {
  val = clampf(val, -1.0f, 1.0f);
  if (fabs(val) < 0.001f) {
    // 停止
    digitalWrite(phasePin, LOW);
    analogWrite(enPin, 0);
    return;
  }
  bool forward = (val > 0);
  digitalWrite(phasePin, forward ? HIGH : LOW);
  int duty = (int)roundf(fabs(val) * PWM_MAX * 0.5);
  analogWrite(enPin, clampi(duty, 0, PWM_MAX));
}

void stopAll() {
  analogWrite(L_EN, 0);
  analogWrite(R_EN, 0);
}

// 受信JSONを処理
void handleMessage(uint8_t num, const String& payload) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    // 形式エラー
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
    if (!estop) { L_cmd = clampf(L, -1, 1); R_cmd = clampf(R, -1, 1); }
  } else if (!strcmp(cmd, "estop")) {
    bool on = doc["on"] | true;
    estop = on;
    if (estop) { stopAll(); }
  } else if (!strcmp(cmd, "reset")) {
    estop = false;
    L_cmd = 0; R_cmd = 0;
    stopAll();
  } else if (!strcmp(cmd, "ping") || !strcmp(cmd, "hello")) {
    // no-op
  }

  // 応答
  StaticJsonDocument<160> res;
  res["ok"] = true;
  res["ts"] = millis();
  res["L"] = L_cmd;
  res["R"] = R_cmd;
  res["estop"] = estop;
  String out; serializeJson(res, out);
  ws.sendTXT(num, out);
}

// WebSocket コールバック
void onWsEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED: {
      IPAddress ip = ws.remoteIP(num);
      Serial.printf("[WS] client #%u connected from %s\n", num, ip.toString().c_str());
      // 初回ACK
      StaticJsonDocument<128> res;
      res["ok"]=true; res["hello"]=true; res["ts"]=millis(); res["estop"]=estop;
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
}

void setup() {
  Serial.begin(115200);
  delay(200);

  // ピン初期化
  pinMode(L_PHASE, OUTPUT);
  pinMode(R_PHASE, OUTPUT);
  pinMode(L_EN, OUTPUT);
  pinMode(R_EN, OUTPUT);
  digitalWrite(L_PHASE, LOW);
  digitalWrite(R_PHASE, LOW);

  // PWM 設定 (ESP32 v3 系)
  analogWriteResolution(L_EN, PWM_RES_BITS);
  analogWriteResolution(R_EN, PWM_RES_BITS);
  analogWriteFrequency(L_EN, PWM_FREQ_HZ);
  analogWriteFrequency(R_EN, PWM_FREQ_HZ);
  analogWrite(L_EN, 0);
  analogWrite(R_EN, 0);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);   // ★ 省電力スリープOFF
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to WiFi SSID: %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) { delay(350); Serial.print("."); }
  Serial.printf("\nWiFi connected: %s  IP=%s\n", WIFI_SSID, WiFi.localIP().toString().c_str());

  // WebSocket
  ws.begin();
  ws.onEvent(onWsEvent);
  Serial.println("WebSocket server started on :81");

}

void loop() {
  ws.loop();

  // E-STOP中は常に停止
  if (estop) {
    stopAll();
  } else {
    applyMotorPHEN(L_PHASE, L_EN, L_cmd);
    applyMotorPHEN(R_PHASE, R_EN, R_cmd);
  }

  // 心拍（接続者全員へ）
  unsigned long now = millis();
  if (now - lastBeatMs >= HEARTBEAT_MS) {
    lastBeatMs = now;
    StaticJsonDocument<160> hb;
    hb["ok"]=true; hb["ts"]=now; hb["L"]=L_cmd; hb["R"]=R_cmd; hb["estop"]=estop;
    String out; serializeJson(hb, out);
    ws.broadcastTXT(out);
  }

  delay(1); // ★ 内部処理にCPUを譲る
}
