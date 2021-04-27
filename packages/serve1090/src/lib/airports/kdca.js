const _ = require('lodash');

// this module defines an approach/departure route for runway 01-19 at KDCA
// polygons generated via https://www.keene.edu/campus/maps/tool/
// headings generated via https://www.acscdg.com/

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
const runway0119 = {
  key: 'kdca:route0119:runway',
  name: 'KDCA Runway 01-19',
  ceiling: 200,
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
const north0119 = {
  key: 'kdca:route0119:north',
  name: 'KDCA North',
  ceiling: 5000,
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
const south0119 = {
  key: 'kdca:route0119:south',
  name: 'KDCA South',
  ceiling: 5000,
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

const route0119 = {
  key: 'kdca:route0119',
  regions: [north0119, south0119],
  runway: runway0119,
  // TODO this really shouldn't live in here
  getActiveRunway: function (sample) {
    if (!_.has(sample, 'track')) return false;
    return isNorthward(sample.track) ? '1' : '19';
  },
  getApproachRouteKey (runway) {
    switch (runway) {
      case '1':
        return south0119.key;
      case '19':
        return north0119.key;
      default:
        return false;
    }
  },
  getDepartureRouteKey (runway) {
    switch (runway) {
      case '1':
        return north0119.key;
      case '19':
        return south0119.key;
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
  key: 'kdca',
  name: 'Ronald Reagan Washington National Airport',
  locus: [-77.037799, 38.852051],
  routes: [route0119]
};
