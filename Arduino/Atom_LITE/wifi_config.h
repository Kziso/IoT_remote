#pragma once

#include <IPAddress.h>

// Declare WiFi credentials (defined in wifi_config.cpp)
extern const char* WIFI_SSID;
extern const char* WIFI_PASS;

// Declare static IP configuration (defined in wifi_config.cpp)
extern const IPAddress WIFI_LOCAL_IP;
extern const IPAddress WIFI_GATEWAY;
extern const IPAddress WIFI_SUBNET;
extern const IPAddress WIFI_PRIMARY_DNS;
extern const IPAddress WIFI_SECONDARY_DNS;
