#include "motor.h"
#include <math.h>

int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

void motorInit() {
  pinMode(L_PHASE, OUTPUT);
  pinMode(R_PHASE, OUTPUT);
  pinMode(L_EN, OUTPUT);
  pinMode(R_EN, OUTPUT);
  digitalWrite(L_PHASE, LOW);
  digitalWrite(R_PHASE, LOW);

#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  analogWriteResolution(L_EN, PWM_RES_BITS);
  analogWriteResolution(R_EN, PWM_RES_BITS);
#else
  analogWriteResolution(PWM_RES_BITS);
#endif
  analogWriteFrequency(L_EN, PWM_FREQ_HZ);
  analogWriteFrequency(R_EN, PWM_FREQ_HZ);
  analogWrite(L_EN, 0);
  analogWrite(R_EN, 0);
}

// val: -1..+1
void applyMotorPHEN(int phasePin, int enPin, float val) {
  val = clampf(val, -1.0f, 1.0f);
  if (fabs(val) < 0.001f) {
    // stop
    digitalWrite(phasePin, LOW);
    analogWrite(enPin, 0);
    return;
  }
  bool forward = (val > 0);
  digitalWrite(phasePin, forward ? HIGH : LOW);
  int duty = (int)roundf(fabs(val) * PWM_MAX * 0.5f);
  analogWrite(enPin, clampi(duty, 0, PWM_MAX));
}

void stopAll() {
  analogWrite(L_EN, 0);
  analogWrite(R_EN, 0);
}

