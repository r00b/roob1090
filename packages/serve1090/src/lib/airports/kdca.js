// this module defines an approach/departure route for runway 01-19 at KDCA
// polygons generated via https://www.keene.edu/campus/maps/tool/
// headings generated via https://www.acscdg.com/
const airspaceName = 'Washington Reagan National Airport';
const airspaceKey = 'kdca';

/**
 * Runway 01/19
 *
 * Coordinates: (lon/lat)
 -77.0370488, 38.8410045
 -77.0363414, 38.8410421
 -77.0384321, 38.8617660
 -77.0391355, 38.8617211
 -77.0370488, 38.8410045
 */
const runway01_19 = {
  key: `${airspaceKey}:route01_19:runway:01-19`,
  name: 'KDCA Runway 01-19',
  ceiling: 500,
  parentAirspace: airspaceKey, // todo don't really need
  boundary: [[
    [
      -77.0370488,
      38.8410045
    ],
    [
      -77.0363414,
      38.8410421
    ],
    [
      -77.0384321,
      38.861766
    ],
    [
      -77.0391355,
      38.8617211
    ],
    [
      -77.0370488,
      38.8410045
    ]
  ]]
};

/**
 * North
 *
 * Coordinates: (lon/lat)
 -77.0384254, 38.8617691
 -77.0263481, 38.8709549
 -77.0381927, 38.8884942
 -77.0502090, 38.9023889
 -77.0584488, 38.9086673
 -77.0819664, 38.9153459
 -77.1284866, 38.9712877
 -77.1574974, 38.9587414
 -77.1063423, 38.8969115
 -77.0874596, 38.8892291
 -77.0700359, 38.8726589
 -77.0391315, 38.8617221
 -77.0384254, 38.8617691
 */
const north01_19 = {
  key: `${airspaceKey}:route01_19:north:01-19`,
  name: 'KDCA North',
  ceiling: 5000,
  parentAirspace: airspaceKey,
  boundary: [[
    [
      -77.0384254,
      38.8617691
    ],
    [
      -77.0263481,
      38.8709549
    ],
    [
      -77.0381927,
      38.8884942
    ],
    [
      -77.050209,
      38.9023889
    ],
    [
      -77.0584488,
      38.9086673
    ],
    [
      -77.0819664,
      38.9153459
    ],
    [
      -77.1284866,
      38.9712877
    ],
    [
      -77.1574974,
      38.9587414
    ],
    [
      -77.1063423,
      38.8969115
    ],
    [
      -77.0874596,
      38.8892291
    ],
    [
      -77.0700359,
      38.8726589
    ],
    [
      -77.0391315,
      38.8617221
    ],
    [
      -77.0384254,
      38.8617691
    ]
  ]]
};

/**
 * South
 *
 * Coordinates: (lon/lat)
 -77.0370474, 38.8410034
 -77.0461750, 38.8397745
 -77.0577621, 38.7895496
 -77.0538139, 38.7021234
 -77.0011139, 38.7039989
 -77.0139885, 38.7918242
 -77.0251894, 38.8410781
 -77.0363420, 38.8410421
 -77.0370474, 38.8410034
 */
const south01_19 = {
  key: `${airspaceKey}:route01_19:south:01-19`,
  name: 'KDCA South',
  ceiling: 5000,
  parentAirspace: airspaceKey,
  boundary: [[
    [
      -77.0370474,
      38.8410034
    ],
    [
      -77.046175,
      38.8397745
    ],
    [
      -77.0577621,
      38.7895496
    ],
    [
      -77.0538139,
      38.7021234
    ],
    [
      -77.0011139,
      38.7039989
    ],
    [
      -77.0139885,
      38.7918242
    ],
    [
      -77.0251894,
      38.8410781
    ],
    [
      -77.036342,
      38.8410421
    ],
    [
      -77.0370474,
      38.8410034
    ]
  ]]
};

const route01_19 = {
  key: `${airspaceKey}:route01_19`,
  parentKey: airspaceKey,
  regions: [north01_19, south01_19],
  runway: runway01_19,
  // TODO this really shouldn't live in here
  getActiveRunway: function (sample) {
    if (!sample) return false;
    return isNorthward(sample.track) ? '1' : '19';
  },
  getApproachRouteKey (runway) {
    switch (runway) {
      case '1':
        return south01_19.key;
      case '19':
        return north01_19.key;
      default:
        return false;
    }
  },
  getDepartureRouteKey (runway) {
    switch (runway) {
      case '1':
        return north01_19.key;
      case '19':
        return south01_19.key;
      default:
        return false;
    }
  }
};

function isNorthward (track) {
  const isNE = (track > 275 && track <= 360);
  const isNW = (track >= 0 && track < 90);
  return (isNE || isNW);
}

module.exports = {
  key: airspaceKey,
  name: airspaceName,
  locus: [-77.037799, 38.852051],
  routes: [route01_19]
};