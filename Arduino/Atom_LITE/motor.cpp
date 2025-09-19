#include "motor.h"
#include <math.h>
static int g_l_phase = -1;
static int g_l_en    = -1;
static int g_r_phase = -1;
static int g_r_en    = -1;
static int g_pwmResBits = 8;
static int g_pwmMax     = (1 << 8) - 1;
static int g_pwmFreqHz  = 1000;

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
  int duty = (int)roundf(fabs(val) * g_pwmMax * 0.5f);
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
