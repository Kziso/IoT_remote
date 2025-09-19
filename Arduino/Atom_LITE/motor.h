#pragma once

#include <Arduino.h>
#include "config_pins.h"

int clampi(int v, int lo, int hi);
float clampf(float v, float lo, float hi);

void motorInit();
void applyMotorPHEN(int phasePin, int enPin, float val);
void stopAll();

