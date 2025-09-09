/*
  UNO R4 WiFi  +  Links2004/arduinoWebSockets 版
  Dual Motor (PH/EN) を WebSocket で制御する最小構成

  - WebSocket ポート: 81  (ws://<IP>:81/)
  - 受信コマンド（テキストJSON/行単位（WSはフレーム単位））
      {"v":1,"cmd":"drive","L":0.75,"R":-0.40}
      {"v":1,"cmd":"estop","on":true}
      {"v":1,"cmd":"reset"}
      {"v":1,"cmd":"ping"} / {"v":1,"cmd":"hello","token":"abc123"}
  - 返信（ACK/心拍）
      {"ok":true,"ts":<millis>,"L":<..>,"R":<..>,"estop":true/false}

  配線（PH/EN）:
    左モーター  A_PHASE=7, A_EN=5(PWM)
    右モーター  B_PHASE=8, B_EN=6(PWM)

  注意:
    - PWMは 0..255（UNO R4 の analogWrite）
    - 2秒無通信で安全停止（ウォッチドッグ）
    - DHCPが遅い時に 0.0.0.0 を回避するため、IP確定まで待機
*/

#include <WiFiS3.h>
#include <WebSocketsServer.h>

// ====== Wi-Fi 設定 ======
const char* SSID = "S413-iso-g";
const char* PASS = "icMU3aQaavPz6Qp2CCxa";

// 静的IPにしたい場合は下を有効化（ネットワークに合わせて設定）
// #define USE_STATIC_IP
#ifdef USE_STATIC_IP
IPAddress ip(192,168,1,50);
IPAddress gw(192,168,1,1);
IPAddress mask(255,255,255,0);
IPAddress dns(192,168,1,1);
#endif

// ====== WebSocket ======
WebSocketsServer webSocket(81); // ws://<ip>:81/

// ====== Motor (PH/EN) 配線 ======
#define A_PHASE 7
#define A_EN    5   // PWM
#define B_PHASE 8
#define B_EN    6   // PWM

// ====== 状態 ======
float leftVal = 0, rightVal = 0;   // -1.0 .. +1.0
bool  estop   = false;
unsigned long lastCmdMs = 0;       // 最終コマンド受信時刻（ウォッチドッグ用）

// ====== ユーティリティ ======
static inline float clampf(float v, float lo, float hi) {
  return (v < lo) ? lo : (v > hi) ? hi : v;
}

float parseKeyFloat(const String& s, const char* key) {
  // とても軽量な手動パース（フルJSONパーサは使わない）
  String pat = String("\"") + key + String("\":");
  int p = s.indexOf(pat);
  if (p < 0) return 0;
  p += pat.length();
  int e = p;
  while (e < (int)s.length() && String("0123456789+-.eE").indexOf(s[e]) >= 0) e++;
  return s.substring(p, e).toFloat();
}

void applyMotor(float v, int phasePin, int enPin) {
  int pwm = (int)(fabs(v) * 255);     // 0..255
  if (v > 0.01f) {
    digitalWrite(phasePin, LOW);      // forward
    analogWrite(enPin, pwm);
  } else if (v < -0.01f) {
    digitalWrite(phasePin, HIGH);     // backward
    analogWrite(enPin, pwm);
  } else {
    analogWrite(enPin, 0);            // stop
  }
}

void sendOK(uint8_t num){
  char buf[128];
  snprintf(buf, sizeof(buf),
    "{\"ok\":true,\"ts\":%lu,\"L\":%.2f,\"R\":%.2f,\"estop\":%s}",
    (unsigned long)millis(), leftVal, rightVal, estop ? "true":"false");
  webSocket.sendTXT(num, buf);
}

// ====== WebSocket イベントコールバック ======
void onWsEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t len) {
  if (type == WStype_DISCONNECTED) {
    // 切断時は安全に停止
    applyMotor(0, A_PHASE, A_EN);
    applyMotor(0, B_PHASE, B_EN);
    return;
  }

  if (type == WStype_CONNECTED) {
    // 接続直後にACK
    sendOK(num);
    return;
  }

  if (type == WStype_TEXT) {
    lastCmdMs = millis();  // 最終受信更新
    String s((char*)payload, len);

    if (s.indexOf("\"cmd\":\"drive\"") >= 0) {
      float L = clampf(parseKeyFloat(s, "L"), -1.0f, 1.0f);
      float R = clampf(parseKeyFloat(s, "R"), -1.0f, 1.0f);
      leftVal  = L;
      rightVal = R;

      if (!estop) {
        applyMotor(leftVal,  A_PHASE, A_EN);
        applyMotor(rightVal, B_PHASE, B_EN);
      } else {
        applyMotor(0, A_PHASE, A_EN);
        applyMotor(0, B_PHASE, B_EN);
      }
      sendOK(num);
    }
    else if (s.indexOf("\"cmd\":\"estop\"") >= 0) {
      estop = true;
      applyMotor(0, A_PHASE, A_EN);
      applyMotor(0, B_PHASE, B_EN);
      webSocket.sendTXT(num, "{\"ok\":true,\"estop\":true}");
    }
    else if (s.indexOf("\"cmd\":\"reset\"") >= 0) {
      estop = false; leftVal = 0; rightVal = 0;
      applyMotor(0, A_PHASE, A_EN);
      applyMotor(0, B_PHASE, B_EN);
      webSocket.sendTXT(num, "{\"ok\":true,\"reset\":true}");
    }
    else if (s.indexOf("\"cmd\":\"ping\"") >= 0 || s.indexOf("\"cmd\":\"hello\"") >= 0) {
      sendOK(num);
    }
    else {
      webSocket.sendTXT(num, "{\"ok\":false}");
    }
  }
}

// ====== Wi-Fi 接続 & IP表示（DHCP待ち含む） ======
void connectWiFiAndPrintIP() {
  Serial.print("Connecting to ");
  Serial.println(SSID);

#ifdef USE_STATIC_IP
  WiFi.config(ip, dns, gw, mask);
#else
  // 明示的にDHCPにしておく（静的IPを使わない場合）
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, INADDR_NONE);
#endif

  WiFi.disconnect();
  WiFi.begin(SSID, PASS);

  // リンク確立待ち
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
    if (millis() - t0 > 15000) {  // 15sタイムアウトで再試行
      Serial.println("\nWiFi connect timeout, retry...");
      WiFi.disconnect();
      delay(500);
      WiFi.begin(SSID, PASS);
      t0 = millis();
    }
  }
  Serial.println("\nWiFi connected");

  // DHCPでIPが来るまで待機（0.0.0.0回避）
  IPAddress myip = WiFi.localIP();
  unsigned long t1 = millis();
  while (myip == INADDR_NONE) {  // INADDR_NONE == 0.0.0.0
    delay(200);
    myip = WiFi.localIP();
    if (millis() - t1 > 5000) {
      Serial.println("DHCP slow — retrying request...");
#ifndef USE_STATIC_IP
      WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, INADDR_NONE);
#endif
      t1 = millis();
    }
  }

  Serial.print("Connected! IP address: ");
  Serial.println(myip);
  Serial.print("Gateway: "); Serial.println(WiFi.gatewayIP());
  Serial.print("Subnet : "); Serial.println(WiFi.subnetMask());
  Serial.print("RSSI   : "); Serial.println(WiFi.RSSI());
}

void setup() {
  pinMode(A_PHASE, OUTPUT);
  pinMode(B_PHASE, OUTPUT);
  pinMode(A_EN, OUTPUT);
  pinMode(B_EN, OUTPUT);

  Serial.begin(115200);
  while (!Serial) { delay(10); }

  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("No WiFi module");
    while (true) {}
  }

  // Wi-Fi 接続 & IPアドレス表示
  connectWiFiAndPrintIP();

  // WebSocket サーバ開始（IP確定後に開始が安全）
  webSocket.begin();
  webSocket.onEvent(onWsEvent);
  Serial.println("WebSocket server started at ws://<IP>:81/");

  lastCmdMs = millis();
}

void loop() {
  webSocket.loop();

  // 無通信 2 秒で安全停止（ESTOP時は常に停止）
  if (!estop && (millis() - lastCmdMs > 2000)) {
    applyMotor(0, A_PHASE, A_EN);
    applyMotor(0, B_PHASE, B_EN);
  }
}
