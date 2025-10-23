#include "wifi_config.h"

// NOTE: Consider moving these to a private (untracked) file.
const char* WIFI_SSID = "S413-iso-g";
const char* WIFI_PASS = "icMU3aQaavPz6Qp2CCxa";

// NOTE: Update these to match your network before building.
const IPAddress WIFI_LOCAL_IP(192, 168, 32, 100);
const IPAddress WIFI_GATEWAY(192, 168, 32, 1);
const IPAddress WIFI_SUBNET(255, 255, 255, 0);
const IPAddress WIFI_PRIMARY_DNS(192, 168, 32, 1);
const IPAddress WIFI_SECONDARY_DNS(192, 168, 32, 1);
