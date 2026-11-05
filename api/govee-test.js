
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GOVEE_API_KEY) {
    return res.status(500).json({ error: "Govee key missing" });
  }

  try {
    const response = await fetch(
      "https://openapi.api.govee.com/router/api/v1/user/devices",
      {
        headers: {
          "Govee-API-Key": process.env.GOVEE_API_KEY
        }
      }
    );

    const data = await response.json();

    if (!response.ok || data.code !== 200) {
      return res.status(502).json({
        error: "Govee request failed",
        status: response.status,
        code: data.code
      });
    }

    const devices = Array.isArray(data.data) ? data.data : [];

    return res.status(200).json({
      connected: true,
      supportedDevices: devices.length,
      availableCapabilities: [...new Set(
        devices.flatMap(d =>
          (d.capabilities || []).map(c => c.instance)
        )
      )]
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not contact Govee"
    });
  }
};
