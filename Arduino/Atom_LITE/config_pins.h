// Pin and PWM configuration (board-specific)
#pragma once

// Default pins (Atom LITE). Change to match your wiring/board.
// For Atom S3 LITE, update these to suitable GPIOs.
static const int L_PHASE = 22;  // left direction
static const int L_EN    = 19;  // left PWM
static const int R_PHASE = 23;  // right direction
static const int R_EN    = 33;  // right PWM

// PWM settings
static const int PWM_RES_BITS = 10;              // 0..1023
static const int PWM_MAX      = (1 << PWM_RES_BITS) - 1;
static const int PWM_FREQ_HZ  = 480;             // 480 Hz

