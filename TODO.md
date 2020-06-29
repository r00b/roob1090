* annotate aircraft with data sources

```
function _printAircraft (aircraft) {
  const {
    flight,
    hex,
    seen,
    updated,
    alt_baro,
    true_heading,
    track,
    lat,
    lon
  } = aircraft;
  console.log('-------------------------------');
  console.log(`Flight: ${flight}`);
  console.log(`Hex: ${hex}`);
  console.log(`Seen: ${seen}`);
  console.log(`Updated: ${updated}`);
  console.log(`Altitude: ${alt_baro}`);
  console.log(`True heading: ${true_heading}`);
  console.log(`Track: ${track}`);
  console.log(`Lat: ${lat}`);
  console.log(`Long: ${lon}`);
  console.log('-------------------------------');
}
```