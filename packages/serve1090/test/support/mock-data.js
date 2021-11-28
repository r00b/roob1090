// airport:
//            (50,200)     (100,200)
//                _____________
//               |             |
//               |01 runway2 19|
//               |             |
//                -------------
//            (50,100)     (100,100)
//                    ac10
//
// (0,50)       (50,50)      (100,50)      (150,50)
//    _________________________________________
//   |             |             |             |
//   |  airspace1  |24 runway1 06|  airspace2  |
//   |             |             |             |
//    -----------------------------------------
// (0,0)        (50,0)       (100,0)       (150,0)
//      ac1           ac4           ac6              ac9 - outside airport
//      ac2           ac5           ac7
//      ac3                         ac8 (too high)

function mockAirport (includeMultipleRunways = false) {
  const airport = {
    ident: 'kvkx',
    name: 'Potomac Airfield',
    active: true,
    lonlat: [
      75,
      25
    ],
    runways: [
      {
        key: 'runway1',
        ceiling: 500,
        surfaces: [
          {
            name: '24',
            trueHeading: 240,
            approachRegionKey: 'airspace1',
            departureRegionKey: 'airspace2'
          },
          {
            name: '06',
            trueHeading: 60,
            approachRegionKey: 'airspace2',
            departureRegionKey: 'airspace1'
          }
        ],
        boundary: [
          [50, 0],
          [100, 0],
          [100, 50],
          [50, 50],
          [50, 0]
        ]
      }
    ],
    airspace: [
      {
        key: 'airspace1',
        ceiling: 10000,
        boundary: [
          [0, 0],
          [50, 0],
          [50, 50],
          [0, 50],
          [0, 0]
        ]
      },
      {
        key: 'airspace2',
        ceiling: 10000,
        boundary: [
          [100, 0],
          [150, 0],
          [150, 50],
          [100, 50],
          [100, 0]
        ]
      }
    ]
  };

  if (includeMultipleRunways) {
    airport.runways.push({
      key: 'runway2',
      ceiling: 500,
      surfaces: [
        {
          name: '01',
          trueHeading: 10,
          approachRegionKey: 'airspace1',
          departureRegionKey: 'airspace2'
        },
        {
          name: '19',
          trueHeading: 190,
          approachRegionKey: 'airspace2',
          departureRegionKey: 'airspace1'
        }
      ],
      boundary: [
        [50, 100],
        [100, 100],
        [100, 200],
        [50, 200],
        [50, 100]
      ]
    });
  }

  return airport;
}

function mockAircraft () {
  return {
    ac1: {
      hex: 'ac1',
      altBaro: 500,
      lon: 0,
      lat: 0
    },
    ac2: {
      hex: 'ac2',
      altBaro: 500,
      lon: 25,
      lat: 25
    },
    ac3: {
      hex: 'ac3',
      altBaro: 250,
      lon: 45,
      lat: 45
    },
    ac4: {
      hex: 'ac4',
      altBaro: 250,
      lon: 75,
      lat: 25
    },
    ac5: {
      hex: 'ac5',
      altBaro: 250,
      lon: 75,
      lat: 25
    },
    ac6: {
      hex: 'ac6',
      altBaro: 500,
      lon: 125,
      lat: 25
    },
    ac7: {
      hex: 'ac7',
      altBaro: 500,
      lon: 145,
      lat: 20
    },
    ac8: {
      hex: 'ac8',
      altBaro: 50000,
      lon: 125,
      lat: 25
    },
    ac9: {
      hex: 'ac9',
      altBaro: 500,
      lon: 200,
      lat: 25
    },
    ac10: {
      hex: 'ac10',
      altBaro: 250,
      lon: 75,
      lat: 150
    }
  };
}

module.exports = {
  mockAirport,
  mockAircraft
};
