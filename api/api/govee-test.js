
var https = require('https');
var lib = require('../_lib');

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return lib.json(res, 405, { error: 'GET only' });
  }

  // Only browsers paired to your Spotify account
  // can access this diagnostic endpoint.
  lib.getSession(req, res, function (err, session) {
    if (err || !session) {
      return lib.json(res, 401, {
        error: 'Open this on your paired Spotify dashboard.'
      });
    }

    if (!process.env.GOVEE_API_KEY) {
      return lib.json(res, 500, {
        error: 'GOVEE_API_KEY is not configured.'
      });
    }

    var request = https.get(
      'https://openapi.api.govee.com/router/api/v1/user/devices',
      {
        headers: {
          'Govee-API-Key': process.env.GOVEE_API_KEY
        },
        timeout: 10000
      },
      function (response) {
        var raw = '';

        response.on('data', function (chunk) {
          raw += chunk;
        });

        response.on('end', function () {
          try {
            var result = JSON.parse(raw);

            if (response.statusCode !== 200 ||
                result.code !== 200) {
              return lib.json(res, 502, {
                error: 'Govee API request failed',
                httpStatus: response.statusCode,
                goveeCode: result.code
              });
            }

            var devices = Array.isArray(result.data)
              ? result.data : [];

            return lib.json(res, 200, {
              connected: true,
              deviceCount: devices.length,
              devices: devices.map(function (device) {
                return {
                  name: device.deviceName || 'Unnamed',
                  model: device.sku,
                  controls: (device.capabilities || [])
                    .map(function (cap) {
                      return cap.instance;
                    })
                };
              })
            });
          } catch (e) {
            return lib.json(res, 502, {
              error: 'Invalid response from Govee'
            });
          }
        });
      }
    );

    request.on('timeout', function () {
      request.destroy();
    });

    request.on('error', function () {
      return lib.json(res, 502, {
        error: 'Govee connection failed'
      });
    });
  });
};
