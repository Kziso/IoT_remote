#define A_PHASE 7
#define A_EN    5   // PWM
#define B_PHASE 8
#define B_EN    6   // PWM

float leftVal = 0, rightVal = 0;  // -1.0 ～ +1.0
bool estop = false;

void setup() {
  pinMode(A_PHASE, OUTPUT);
  pinMode(B_PHASE, OUTPUT);
  pinMode(A_EN, OUTPUT);
  pinMode(B_EN, OUTPUT);

  Serial.begin(115200);
  while (!Serial) { delay(10); }
  Serial.println("READY");
}

void loop() {
  static String buf;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      handleLine(buf);
      buf = "";
    } else if (c != '\r') {
      buf += c;
      if (buf.length() > 100) buf = "";
    }
  }

  // モーター制御反映
  if (estop) {
    stopMotors();
  } else {
    applyMotor(leftVal,  A_PHASE, A_EN);
    applyMotor(rightVal, B_PHASE, B_EN);
  }
}

void handleLine(const String& s) {
  if (s.startsWith("ESTOP:")) {
    estop = s.endsWith("1");
    if (estop) { leftVal = 0; rightVal = 0; }
    Serial.println("OK ESTOP");
    return;
  }
  if (s == "RESET") {
    leftVal = 0; rightVal = 0; estop = false;
    Serial.println("OK RESET");
    return;
  }

  int lpos = s.indexOf("L:");
  int rpos = s.indexOf(",R:");
  if (lpos == 0 && rpos > 0) {
    String lstr = s.substring(2, rpos);
    String rstr = s.substring(rpos+3);
    float l = lstr.toFloat();
    float r = rstr.toFloat();
    leftVal  = constrain(l, -1.0, 1.0);
    rightVal = constrain(r, -1.0, 1.0);
    Serial.print("OK L="); Serial.print(leftVal,2);
    Serial.print(" R="); Serial.println(rightVal,2);
  } else {
    Serial.println("ERR");
  }
}

void applyMotor(float v, int phasePin, int enPin) {
  int pwm = (int)(fabs(v) * 255); // 0..255
  if (v > 0.01) {
    digitalWrite(phasePin, LOW);   // forward
    analogWrite(enPin, pwm);
  } else if (v < -0.01) {
    digitalWrite(phasePin, HIGH);  // backward
    analogWrite(enPin, pwm);
  } else {
    analogWrite(enPin, 0);         // stop
  }
}

void stopMotors() {
  analogWrite(A_EN, 0);
  analogWrite(B_EN, 0);
}
