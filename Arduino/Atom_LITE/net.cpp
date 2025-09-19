#include <Arduino.h>
#include <WiFi.h>
#include "wifi_config.h"

void wifiConnect() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to WiFi SSID: %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) { delay(350); Serial.print("."); }
  Serial.printf("\nWiFi connected: %s  IP=%s\n", WIFI_SSID, WiFi.localIP().toString().c_str());
}

