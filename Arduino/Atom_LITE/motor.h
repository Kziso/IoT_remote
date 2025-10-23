#pragma once

#include <Arduino.h>

int clampi(int v, int lo, int hi);
float clampf(float v, float lo, float hi);

// Initialize motor driver pins and PWM settings
void motorInit(int l_phase, int l_en, int r_phase, int r_en,
               int pwm_res_bits, int pwm_freq_hz);

// Adjusts the duty cycle ceiling (0..1). Default is 0.5 (50%).
void setMotorOutputScale(float scale);

void applyMotorPHEN(int phasePin, int enPin, float val);
void stopAll();

// Convenience: apply both motors using configured pins
void applyMotors(float left, float right);
