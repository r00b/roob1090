// derived from https://github.com/flightaware/dump1090/blob/master/README-json.md
// TODO are these all optional
// TODO isizes
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Aircraft {
    hex: String, // 24-bit ICAO identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    r#type: Option<String>, // type of message
    #[serde(skip_serializing_if = "Option::is_none")]
    flight: Option<String>, // callsign
    #[serde(skip_serializing_if = "Option::is_none")]
    alt_baro: Option<isize>, // aircraft barometric altitude (feet) TODO this will blow up if alt_baro = "grnd"
    #[serde(skip_serializing_if = "Option::is_none")]
    alt_geom: Option<isize>, // geometric altitude (feet)
    #[serde(skip_serializing_if = "Option::is_none")]
    gs: Option<f32>, // groundspeed (knots)
    #[serde(skip_serializing_if = "Option::is_none")]
    ias: Option<f32>, // indicated airspeed (knots)
    #[serde(skip_serializing_if = "Option::is_none")]
    tas: Option<f32>, // true airspeed (knots)
    #[serde(skip_serializing_if = "Option::is_none")]
    mach: Option<f32>, // Mach Number
    #[serde(skip_serializing_if = "Option::is_none")]
    track: Option<f32>, // tru track over ground (degrees, 0-359)
    #[serde(skip_serializing_if = "Option::is_none")]
    track_rate: Option<f32>, // rate of change of track (degrees/second)
    #[serde(skip_serializing_if = "Option::is_none")]
    roll: Option<f32>, // roll, degrees, negative if left roll
    #[serde(skip_serializing_if = "Option::is_none")]
    mag_heading: Option<f32>, // heading, degrees clockwise from magnetic north
    #[serde(skip_serializing_if = "Option::is_none")]
    true_heading: Option<f32>, // heading, degrees clockwise from true north
    #[serde(skip_serializing_if = "Option::is_none")]
    baro_rate: Option<f32>, // rate of change of barometric altitude, feet/minute
    #[serde(skip_serializing_if = "Option::is_none")]
    geom_rate: Option<f32>, // rate of change of geometric altitude, feet/minute
    #[serde(skip_serializing_if = "Option::is_none")]
    squawk: Option<String>, // Mode A code
    #[serde(skip_serializing_if = "Option::is_none")]
    emergency: Option<String>, // ADS-B emergency status
    #[serde(skip_serializing_if = "Option::is_none")]
    category: Option<String>, // emitter category to identify aircraft
    #[serde(skip_serializing_if = "Option::is_none")]
    nav_qnh: Option<f32>, // altimeter setting
    #[serde(skip_serializing_if = "Option::is_none")]
    nav_altitude_mcp: Option<isize>, // MCP/FCU selected altitude
    #[serde(skip_serializing_if = "Option::is_none")]
    nav_altitude_fms: Option<isize>, // selected altitude from FMS
    #[serde(skip_serializing_if = "Option::is_none")]
    nav_heading: Option<f32>, // selected heading
    #[serde(skip_serializing_if = "Option::is_none")]
    nav_modes: Option<Vec<String>>, // set of engaged automation modes
    #[serde(skip_serializing_if = "Option::is_none")]
    lat: Option<f64>, // latitude
    #[serde(skip_serializing_if = "Option::is_none")]
    lon: Option<f64>, // longitude
    #[serde(skip_serializing_if = "Option::is_none")]
    nic: Option<isize>, // navigation integrity category
    #[serde(skip_serializing_if = "Option::is_none")]
    rc: Option<isize>, // radius of containment
    #[serde(skip_serializing_if = "Option::is_none")]
    seen_pos: Option<f32>, // how long ago in seconds the position was last updated
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<isize>, // ADS-B version number (0, 1, 2)
    #[serde(skip_serializing_if = "Option::is_none")]
    nic_baro: Option<isize>, // navigation integrity category for barometric altitude
    #[serde(skip_serializing_if = "Option::is_none")]
    nac_p: Option<isize>, // navigation accuracy for position
    #[serde(skip_serializing_if = "Option::is_none")]
    nac_v: Option<isize>, // naviation accuracy for velocity
    #[serde(skip_serializing_if = "Option::is_none")]
    sil: Option<isize>, // source integrity level
    #[serde(skip_serializing_if = "Option::is_none")]
    sil_type: Option<String>, // interpretation of SIL (unknown, perhour, persample)
    #[serde(skip_serializing_if = "Option::is_none")]
    gva: Option<isize>, // geometric vertical accuracy
    #[serde(skip_serializing_if = "Option::is_none")]
    sda: Option<isize>, // system design assurance
    #[serde(skip_serializing_if = "Option::is_none")]
    mlat: Option<Vec<String>>, // list of fields derived from MLAT
    #[serde(skip_serializing_if = "Option::is_none")]
    tisb: Option<Vec<String>>, // list of fields derived from TIS-B
    #[serde(skip_serializing_if = "Option::is_none")]
    messages: Option<isize>, // number of Mode S messages received from aircraft
    #[serde(skip_serializing_if = "Option::is_none")]
    seen: Option<f64>, // how long ago (seconds) a message was last received
    #[serde(skip_serializing_if = "Option::is_none")]
    rssi: Option<f64>, // recent verage RSSI (signal power) (dbFS) (always negative)
}
