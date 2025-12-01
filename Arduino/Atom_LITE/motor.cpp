#include "motor.h"
#include <math.h>
static int g_l_phase = -1;
static int g_l_en    = -1;
static int g_r_phase = -1;
static int g_r_en    = -1;
static int g_pwmResBits = 10;
static int g_pwmMax     = (1 << 10) - 1;
static int g_pwmFreqHz  = 20000;
static float g_pwmScale  = 0.7f;
static bool g_startupDone = false;

int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

void motorInit(int l_phase, int l_en, int r_phase, int r_en,
               int pwm_res_bits, int pwm_freq_hz) {
  g_l_phase = l_phase; g_l_en = l_en;
  g_r_phase = r_phase; g_r_en = r_en;
  g_pwmResBits = pwm_res_bits;
  g_pwmMax = (1 << g_pwmResBits) - 1;
  g_pwmFreqHz = pwm_freq_hz;

  pinMode(g_l_phase, OUTPUT);
  pinMode(g_r_phase, OUTPUT);
  pinMode(g_l_en, OUTPUT);
  pinMode(g_r_en, OUTPUT);
  digitalWrite(g_l_phase, LOW);
  digitalWrite(g_r_phase, LOW);

#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  analogWriteResolution(g_l_en, g_pwmResBits);
  analogWriteResolution(g_r_en, g_pwmResBits);
#else
  analogWriteResolution(g_pwmResBits);
#endif
  analogWriteFrequency(g_l_en, g_pwmFreqHz);
  analogWriteFrequency(g_r_en, g_pwmFreqHz);
  analogWrite(g_l_en, 0);
  analogWrite(g_r_en, 0);
}

void setMotorOutputScale(float scale) {
  g_pwmScale = clampf(scale, 0.0f, 1.0f);
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
  int duty = (int)roundf(fabs(val) * g_pwmMax * g_pwmScale);
  analogWrite(enPin, clampi(duty, 0, g_pwmMax));
}

void stopAll() {
  if (g_l_en >= 0) analogWrite(g_l_en, 0);
  if (g_r_en >= 0) analogWrite(g_r_en, 0);
}

void applyMotors(float left, float right) {
  if (g_l_phase >= 0 && g_l_en >= 0) applyMotorPHEN(g_l_phase, g_l_en, left);
  if (g_r_phase >= 0 && g_r_en >= 0) applyMotorPHEN(g_r_phase, g_r_en, right);
}

void startMotorsIfNeeded(float left, float right) {
  // If both outputs are (near) zero, treat as stopped and reset startup flag
  const float stopThreshold = 0.02f;
  if (fabs(left) < stopThreshold && fabs(right) < stopThreshold) {
    applyMotors(left, right);
    g_startupDone = false;
    return;
  }

  // Already running normally
  if (g_startupDone) {
    applyMotors(left, right);
    return;
  }

  // If pins are not initialized, fall back to normal apply
  if (g_l_phase < 0 || g_l_en < 0 || g_r_phase < 0 || g_r_en < 0) {
    applyMotors(left, right);
    g_startupDone = true;
    return;
  }

  const float step1 = 0.3f;
  const float step2 = 0.6f;
  const int stepDelayMs = 30;   // Delay between ramp steps per motor
  const int betweenMotorsMs = 60; // Delay before starting the second motor

  // Soft-start left motor
  applyMotorPHEN(g_l_phase, g_l_en, left * step1);
  applyMotorPHEN(g_r_phase, g_r_en, 0.0f); // keep right stopped
  delay(stepDelayMs);
  applyMotorPHEN(g_l_phase, g_l_en, left * step2);
  delay(stepDelayMs);
  applyMotorPHEN(g_l_phase, g_l_en, left);
  Serial.printf("Left start\n");
  delay(betweenMotorsMs);

  // Soft-start right motor
  applyMotorPHEN(g_r_phase, g_r_en, right * step1);
  delay(stepDelayMs);
  applyMotorPHEN(g_r_phase, g_r_en, right * step2);
  delay(stepDelayMs);
  applyMotorPHEN(g_r_phase, g_r_en, right);
  Serial.printf("Right start\n");
  g_startupDone = true;
}
