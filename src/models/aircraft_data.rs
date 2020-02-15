pub use super::Aircraft;

#[derive(Serialize, Deserialize, Debug)]
pub struct AircraftData {
    now: f64,
    messages: u32,
    aircraft: Vec<Aircraft>,
}
