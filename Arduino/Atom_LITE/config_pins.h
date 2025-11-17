// Pin and PWM configuration (board-specific)
#pragma once

#if defined(ARDUINO_M5STACK_ATOMS3) || defined(ARDUINO_M5STACK_ATOMS3LITE)
// Atom S3 LITE: exposed GPIOs on the grove port, use 5/6/7/8
static const int L_PHASE = 5;   // left direction
static const int L_EN    = 6;   // left PWM
static const int R_PHASE = 7;   // right direction
static const int R_EN    = 8;   // right PWM
#else
// Atom LITE (ESP32): default pins, update if wiring differs
static const int L_PHASE = 22;  // left direction
static const int L_EN    = 19;  // left PWM
static const int R_PHASE = 23;  // right direction
static const int R_EN    = 33;  // right PWM
#endif

// PWM settings
static const int PWM_RES_BITS = 10;              // 0..1023
static const int PWM_MAX      = (1 << PWM_RES_BITS) - 1;
static const int PWM_FREQ_HZ  = 480;             // 480 Hz

// Scale motor duty cycle (0.0-1.0). 0.5 = 50% ceiling.
static const float MOTOR_OUTPUT_SCALE = 0.9f;
