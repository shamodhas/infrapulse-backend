// backend/server.ts
import express from "express"
import helmet from "helmet"
import axios from "axios"
import cors from "cors"

const app = express()
app.use(helmet())
app.use(cors())
app.use(express.json())

const AGENT_TOKEN =
  process.env.SECURE_TOKEN ||
  "JPayZIfQHEmhaQzpDfhOld73Q7GFrcxdLwalPus88taEJqfTU3aeHO02gAOeayHf"

const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY

const clientAuthMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const clientToken = req.headers.authorization?.split(" ")[1]
  if (!clientToken)
    return res.status(401).json({ error: "Client Unauthorized" })
  next()
}

const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (token !== AGENT_TOKEN)
    return res.status(403).json({ error: "Unauthorized Agent" })
  next()
}

const sendAlert = async (message: string) => {
  if (!WHATSAPP_PHONE || !WHATSAPP_API_KEY) return
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(message)}&apikey=${WHATSAPP_API_KEY}`
  await axios.get(url).catch(() => {})
}

app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ status: "healthy", timestamp: new Date().toISOString() })
})

app.post("/api/metrics", authMiddleware, async (req, res) => {
  const { system, containers } = req.body

  if (system.cpu > 85.0) {
    await sendAlert(`⚠️ *CRITICAL:* CPU Usage at ${system.cpu}%`)
  }

  const crashed = containers.filter((c: any) => c.status === "exited")
  if (crashed.length > 0) {
    await sendAlert(
      `🚨 *ALERT:* Containers Down -> ${crashed.map((c: any) => c.name).join(", ")}`
    )
  }

  res.status(200).json({ status: "Logged" })
})

app.get("/api/containers", clientAuthMiddleware, async (req, res) => {
  try {
    const targetHost = req.headers["x-target-host"] as string
    if (!targetHost) {
      return res.status(400).json({ error: "Target host header missing" })
    }

    const authHeader = req.headers.authorization
    const clientToken = authHeader?.split(" ")[1]

    const protocol = targetHost.includes("ngrok") ? "https" : "http"
    const dynamicAgentUrl = targetHost.includes("ngrok")
      ? `${protocol}://${targetHost}`
      : `${protocol}://${targetHost}:8000`

    const response = await axios.get(`${dynamicAgentUrl}/containers`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    })
    res.json(response.data)
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch containers from target host" })
  }
})

app.post(
  "/api/containers/:id/restart",
  clientAuthMiddleware,
  async (req, res) => {
    try {
      const containerId = req.params.id
      const targetHost = req.body.host

      if (!targetHost) {
        return res
          .status(400)
          .json({ error: "Target host missing in request body" })
      }

      const authHeader = req.headers.authorization
      const clientToken = authHeader?.split(" ")[1]

      const protocol = targetHost.includes("ngrok") ? "https" : "http"
      const dynamicAgentUrl = targetHost.includes("ngrok")
        ? `${protocol}://${targetHost}`
        : `${protocol}://${targetHost}:8000`

      const response = await axios.post(
        `${dynamicAgentUrl}/containers/${containerId}/restart`,
        {},
        {
          headers: { Authorization: `Bearer ${clientToken}` }
        }
      )
      res.json(response.data)
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to restart container on target host" })
    }
  }
)

app.listen(3000, () => console.log("Backend running on port 3000"))
